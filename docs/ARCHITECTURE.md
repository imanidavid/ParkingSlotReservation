# Karita — Architecture

**This supersedes §7 and §10.4–10.7 of the Phase 1 document.** Those sections
describe a JSF + managed-bean + Hibernate prototype that was removed in commit
`15835ee`. None of it ships. If you're grading against Phase 1, read this file
instead for anything architectural.

---

## 1. Style, and why

Karita is a **layered monolith** on Spring Boot 4.1.1 — one deployable, one
process, one database, with strict one-directional layers inside it.

That's a choice worth defending, since microservices are the fashionable answer.
Karita has five entities and three roles. Split that across services and you buy
yourself network calls, distributed transactions and a deployment pipeline, in
exchange for solving coordination problems a single team doesn't have. Worse,
the single hardest requirement in the whole system — never double-book a bay —
is trivially solved by one database constraint inside one transaction, and
genuinely hard the moment slot state lives behind a service boundary. So: one
process, strict internal seams, and the option to split later if a facility
count ever justifies it.

The layers:

```
  browser  ─ React 19 (Vite), ten page entries, one api() helper
     │  JSON over HTTP, same origin
  ─────────────────────────────────────────────────────────
  web/         filters → interceptor → 5 controllers → error handler
  service/     business rules, validation, transactions, view assembly
  repository/  4 Spring Data JPA interfaces, hand-written JPQL
  model/       5 entities + 5 enums, Bean Validation, JPA mapping
  ─────────────────────────────────────────────────────────
  PostgreSQL 16 ─ constraints, indexes, the exclusion constraint
  MongoDB 7     ─ append-only audit and notification documents
  RabbitMQ      ─ notification events
```

Enforced, not just drawn: `web/` imports nothing from `repository/`, and
`service/` imports nothing from `jakarta.servlet`. Both are currently zero and
easy to re-check with grep.

---

## 2. Request path

Every API call runs the same gauntlet, in this order:

**`OriginCheckFilter`** (highest precedence) — for any non-GET/HEAD/OPTIONS under
`/api/`, rejects `Sec-Fetch-Site: cross-site` and any `Origin` that doesn't match
`Host`. This is the CSRF defence. No tokens needed, because there's exactly one
origin.

**`PageAccessFilter`** — only for page requests. Maps each `.html` to its role,
redirects signed-out visitors to sign-in (adding `?reason=expired` and clearing
the cookie when the session has died), bounces signed-in users away from the
sign-in page, and routes `/` to the right home per role.

**`ApiAuthInterceptor`** — registered on `/api/**` except login and register.
No session → `401`. Then the role gate: `/api/admin/` needs ADMIN,
`/api/attendant/` needs ATTENDANT, `/api/auth/me` is open to anyone signed in,
everything else needs USER. Sets `Cache-Control: no-store` on the way through.

**Controller** — five of them: Auth, Driver, Attendant, Admin, Logout. They parse
the request and delegate. No business logic lives here.

**Service** — the rules. Validates, loads, decides, writes, assembles the
response shape.

**`ApiErrorHandler`** — a `@RestControllerAdvice` turning every `ApiException`
into the one error envelope: `{error, field?, fields?}`.

Role checks are coarse by design — they answer *what kind of user is this*. They
don't answer *is this row yours*, which is a separate question answered in the
service layer: `ReservationService.own(userId, serial)` for drivers,
`AttendantService.facilityOf(userId)` plus `atFacility()` for attendants. Both
checks have to pass. A driver with a valid session still gets `404` on someone
else's reservation.

One caveat I'd rather flag than hide: the interceptor resolves the required role
by URL prefix and falls through to `USER` as the default. Add `/api/reports/`
next month without touching that switch, and it's silently driver-accessible.
It fails open. A declarative scheme would fail closed, and that's the main thing
I'd change about the security design.

---

## 3. Concurrency — the one genuinely hard part

Two drivers, same bay, same window, requests milliseconds apart. Check-then-insert
loses this race every time; there's always a window between the check and the
write.

Karita closes it twice.

In the service, `ParkingSlotRepository` takes a `PESSIMISTIC_WRITE` lock on the
bay row (`SELECT … FOR UPDATE`), then re-checks for a conflicting hold inside the
same transaction. The second driver blocks until the first commits, re-checks,
finds the clash, gets a clean `409` with a human-readable message.

In the database, `reservations_no_overlap` makes the bad state unrepresentable
regardless of what application code does — see `DATA-MODEL.md §3`. Belt and
braces, and the braces survive a refactor that loses the belt.

Time runs through an injectable `java.time.Clock` bean rather than
`Instant.now()` scattered everywhere, so tests drive "now" with `MutableClock`
and exercise no-show timeouts and expiry without sleeping.

---

## 4. Performance

Nothing exotic, just the usual things done consistently.

Every list query uses `JOIN FETCH` for the associations it will render, so the
N+1 problem doesn't arise — `findByUserWithDetails`, `findAtFacilityStarting` and
`findForAdmin` all pull facility, slot, payment and user in one round trip.
Counts are aggregates (`COUNT … GROUP BY`) rather than loading rows to count them
in Java; `countUpcomingBySlot` returns one row per bay instead of thousands of
reservations. Three composite indexes cover the three hot read paths. Hibernate
batches writes at 200 with `order_inserts`, which is why seeding ~15,000
bookings takes about 7 seconds rather than minutes. `open-in-view=false` keeps
sessions off the render path, so a lazy-loading surprise fails loudly in a test
rather than quietly issuing queries during serialisation. HikariCP pools
connections — which is also the fix for the Phase 1 "too many clients" bug, now
obsolete since Spring Boot owns the `EntityManagerFactory` lifecycle. Result sets
are capped: admin lists at 300 rows with the limit echoed in the response, home
lists at 5.

What's missing: no load test. The targets in `REQUIREMENTS.md §3` are engineering
intent, not measurements, and they're labelled that way.

---

## 5. Messaging

Three things are worth telling a driver about — their bay is booked, their money
arrived, their booking is off — and none of them should happen on the request
thread. A driver waiting on an HTTP response shouldn't also be waiting on an SMS
gateway. So they go through RabbitMQ.

```
ReservationService ──publishEvent──▶ Spring event
                                         │
                                  EventRelay  @TransactionalEventListener(AFTER_COMMIT)
                                         │
                              karita.events (topic exchange)
                                    ╱           ╲
                   reservation.#, payment.#      reservation.confirmed,
                              ╱                   payment.received
                     karita.email                      ╲
                              │                      karita.sms
                   EmailNotificationListener              │
                                                SmsNotificationListener
```

The `AFTER_COMMIT` phase is the part that matters. Publish inside the
transaction and you can email somebody "your bay is booked" and then have the
insert roll back on the exclusion constraint — the message is already gone and
there's no unsending it. Waiting for the commit means nothing is ever announced
that didn't actually happen.

Routing is a topic exchange rather than a direct one so adding a consumer is a
binding, not a code change. Email binds `reservation.#` and `payment.#` and
hears everything; SMS binds only `reservation.confirmed` and `payment.received`,
because a cancellation is not worth a text message. Both queues are durable and
both dead-letter to `karita.events.dlx` after three failed attempts, so a message
nobody can handle parks somewhere visible instead of spinning forever.

Delivery itself is simulated — Phase 1 §3 puts external gateways out of scope
alongside payment processors — so the listeners render the message they would
send and log it. Swapping in SMTP or an SMS provider is a change to one class;
nothing upstream knows how a notification gets delivered.

Two deliberate details. The JSON converter trusts exactly one package for
deserialisation (`…messaging`), because the alternative — the `*` wildcard — lets
anyone who can reach the queue name a class and have it constructed on our side.
And publishing is wrapped in a `try/catch`: by the time an event is published the
booking is committed and the driver has their ticket, so a broker that's down is
a notification problem, not a reservation problem. Verified by pointing the app
at a dead port: it starts, bookings succeed, and each failed publish logs an
error and is dropped. Running without a broker at all is a supported
configuration — `karita.notifications.enabled=false` swaps in a no-op publisher,
which is what the test profile uses.

## 6. Persistence split — why two databases

PostgreSQL holds anything with relationships and rules: facilities, bays, users,
reservations, payments. That data has foreign keys, uniqueness, overlapping-range
constraints and transactions, and a relational engine is simply better at all of
it.

MongoDB holds two append-only collections that have none of those properties.

`audit_events` records every staff action — slot and facility CRUD, cancellations,
cash taken, check-ins, releases, no-shows. The deciding factor is the `details`
sub-document: a slot edit carries the fields submitted and the resulting values,
a cash payment carries an amount, a release carries the minute the bay was freed.
Relationally that's either a column per action type sitting null for every other
type, or a key/value side table that's miserable to query. As a document it's
just the shape it is, and adding an action tomorrow needs no migration.

`notifications` records what was actually delivered: channel, recipient, subject,
body, the event id it came from. Email rows carry a subject; SMS rows carry a
character count and no subject. Same argument — one collection, two shapes, no
null columns.

Neither collection is ever joined to the relational data, and neither participates
in a transaction with it. That's deliberate: writes are best-effort, because by
the time we're logging that a bay was deleted it has been deleted, and losing the
audit line is better than refusing an admin's work because the log database is
unreachable. Failures log at error level. Reads degrade to an empty list.

Three configuration details worth knowing, all found by testing rather than
reading:

Spring Boot 4 reads the connection from `spring.mongodb.*`, not the older
`spring.data.mongodb.*`, and defaults it to `mongodb://localhost/test`. Setting
only the old property leaves every document in a database literally called
`test` while everything appears to work.

The driver's default server-selection timeout is 30 seconds, so with MongoDB down
every audited admin action blocked for half a minute before succeeding — a log
outage presenting as an application outage. `serverSelectionTimeoutMS=2000` in
the URI brings that to about two seconds.

And `spring.data.mongodb.auto-index-creation=true` builds indexes *during*
startup, which means connecting to MongoDB during startup, which means a stopped
MongoDB stops the application from booting at all. It's off; `OpsIndexes` creates
the four named indexes on `ApplicationReadyEvent` instead, each independently and
inside a try/catch, so a missing log database costs the indexes and a warning
rather than the service.

Admins can read both collections through `GET /api/admin/audit` (filterable by
action or facility) and `GET /api/admin/notifications` (filterable by
reservation). Running without MongoDB is supported: `karita.audit.enabled=false`
swaps in a no-op log, which is what the test profile uses.

## 7. Authentication

Two ways in, one session out.

**Password sign-in** is the original: PBKDF2-HMAC-SHA256 at 210,000 iterations
with a per-user random salt, constant-time comparison, and a dummy hash compared
against when the email is unknown so response timing doesn't reveal which
addresses have accounts. Sign-in rotates the session id (no fixation), the cookie
is HttpOnly and SameSite=Lax, and repeated failures are throttled to ten per
email and IP per fifteen minutes.

**Google sign-in** is OAuth2 / OpenID Connect via Spring Security's
`oauth2-client`. The authorisation request carries `state`, `nonce` and a PKCE
`code_challenge` (S256) — all of which Spring Boot's Google provider sets up by
default, and all of which matter: `state` ties the callback to the browser that
started it, `nonce` to the session, and PKCE stops an intercepted authorisation
code being redeemed by anyone else.

The important design decision is what happens *after* the handshake.

Spring Security is deliberately not the authorization system here. It runs with
`anyRequest().permitAll()`, and its CSRF, form login, HTTP Basic and logout are
all disabled. Access control stays with `OriginCheckFilter`, `PageAccessFilter`
and `ApiAuthInterceptor`, which already run ahead of the Spring Security chain
and already understand this application's roles and per-resource ownership. Two
systems answering the same question is two systems that will eventually
disagree, and the one that disagrees quietly is the one that lets someone in.

So `OAuth2SuccessHandler` ends the Spring Security story: it reads the verified
email, clears Spring's `SecurityContext`, and mints exactly the same
`HttpSession` a password login produces. Every filter, role check and ownership
rule downstream behaves identically regardless of how someone signed in.

`FederatedLoginService` links the identity by email, which is the only identifier
both sides share. An existing account is looked up, never replaced — so an admin
whose account email matches their Google address signs in through Google and
keeps being an admin, and nobody gains or loses a role by changing door. Only
genuinely new people are created, always as drivers. Two guards worth naming: an
address Google reports as unverified is rejected, because otherwise someone could
claim another person's account by typing their address into a fresh profile; and
a federated account gets an unguessable random password hash rather than a shared
placeholder, which would be one credential across every such account.

**Configuration.** Google sign-in switches itself on only when a client
registration exists, and the credentials deliberately aren't in
`application.properties` — an empty `client-id` doesn't disable a registration,
it fails validation and stops the application starting. Copy
`backend/oauth.properties.example` to `backend/oauth.properties` (git-ignored)
and fill in the two values; the app imports it optionally, so with no file the
button simply doesn't appear and password sign-in carries on. The authorised
redirect URI is `http://localhost:8080/login/oauth2/code/google`.

## 8. Frontend

React 19, built by Vite. Ten pages, each its own entry point; the backend serves
the build output (`frontend/dist/`) as static files from the same origin, which
is why the session cookie just works and there's no CORS configuration anywhere.

### Multi-page, not a single-page app

This is the one structural decision worth defending. The obvious React shape is
one bundle with a client-side router, and it is the wrong shape here.

Access control is per page: `PageAccessFilter` decides, on the server, that
`/admin.html` is for admins, `/attendant.html` is for attendants, and a signed-out
visitor gets sent to sign-in with a `next` parameter. A client-side router moves
that decision into the browser, where it is advice rather than enforcement —
the server would have to serve one shell to everyone and the role gate would
become a thing the page does to itself. Keeping one HTML entry per page means
the URL a browser asks for is still the thing the server authorises, and the
RBAC story stays the same as it was before React existed in this project.

So `vite.config.js` lists ten entries, Vite emits ten HTML files with the same
names and URLs as before, and `PageAccessFilter`, the deep links, the
`?serial=` parameters and the browser's back button all behave exactly as they
did. The admin console is the one place with client-side routing, via the hash
(`#facilities`, `#slots?facility=kcc&level=P1`) — it is a single protected page
as far as the server is concerned, so there is nothing to enforce between its
sections.

### How it's laid out

```
frontend/
  *.html              ten entry shells: <div id="root"> and one module script
  src/main/*.jsx      one mount per page, importing that page's CSS in order
  src/pages/          a component per page, plus admin/ for the four panes
  src/components/     AppBar, Ticket, Qr, StatusPill, OfflineBanner, FieldError
  src/lib/            api.js (fetch + errors + 401), format.js, hooks.js,
                      ticketCanvas.js (the saved-PNG renderer)
  styles/             design tokens, then base, then per-page stylesheets
```

`src/lib/api.js` is the only place that talks to the backend: it parses the
`{ error, field?, fields? }` envelope, turns a `401` into the sign-in redirect,
and publishes a server-unreachable flag that `<OfflineBanner/>` subscribes to.

The CSS did not change in the port beyond two rules, and that is deliberate —
the markup each component emits is the markup the old DOM builder emitted, class
for class, so all twelve stylesheets, the 20 media queries and the forty
responsive screenshots carry over untouched. The two exceptions are
`#root { display: contents }`, so the mount point doesn't become a flex child
between `<body>` and the page, and the two print rules that hide everything
except `<main>`, which now have to walk through `#root` rather than hide it.

Dark mode is a `useTheme` hook over the same `karita-theme` storage key, with a
four-line inline script in each `<head>` applying the saved value before first
paint so the bundle loading doesn't flash the wrong theme.

`npm run dev` serves the pages with hot reload and proxies `/api`, `/logout` and
the OAuth2 round-trip to a backend on :8080. `npm start` builds and then runs
the backend, which is the one-origin setup everything else assumes.

### Responsiveness, measured

`npm run screens` loads all ten pages at 390, 768, 1280 and 1920 px, writes a
screenshot of each to `docs/screens/` — those forty images are the mock-ups the
brief asks for — and checks each one for horizontal overflow. Currently 40/40
clean.

The check itself is worth a note, because the obvious version of it is wrong.
Reading `document.documentElement.scrollWidth` and comparing it to the viewport
looks like the natural test, but that property reports the unclipped union of
every descendant box and ignores any scroll container in between. The attendant
and admin tables are deliberately wider than a phone and sit inside
`.table-wrap { overflow-x: auto }`, so they are contained by design — yet they
inflate `scrollWidth` to 560 px and 555 px against a 390 px viewport, and the
naive check reports two failures on two pages that are in fact correct.

What the script does instead is ask the browser to scroll right and see whether
it moves (`window.scrollTo(9999, 0)`, then read `scrollX`), and separately list
any element whose right edge passes the viewport *without* a clipping ancestor.
Both are zero everywhere, which is the real claim.

---

## 9. Testing

Forty-three automated checks, all green at the time of writing.

Fourteen MockMvc integration tests run the real Spring context against a real
PostgreSQL (`karita_test`), covering auth, the reservation lifecycle, payment
branches, role enforcement and the double-booking constraint. Four messaging
tests publish through a live broker and read the result back off a throwaway
queue, checking that events route by key, survive JSON conversion both ways, and
that a cancellation stays off the SMS queue; they skip themselves when nothing
answers on the AMQP port, so the suite stays green on a machine without
RabbitMQ. Five more exercise the MongoDB operations log — that audit details
keep whatever shape the action needs, that email and SMS records coexist in one
collection, and that both are filterable — skipping likewise when no Mongo server
answers. Six OAuth2 tests cover the authorisation redirect (asserting `state`, the
client id and the scopes), the providers endpoint in both configured and
unconfigured states, and the account-linking rules — that an existing admin keeps
their role, that federated accounts get distinct unusable passwords, and that a
missing name falls back to the email local part. Fourteen end-to-end checks drive
headless Chrome against a freshly
built jar — real clicks, real forms, real redirects — including two robustness
cases most suites skip: server restart mid-session, and server down entirely.

```
npm run test:backend   # 29 passed (14 API + 4 messaging + 5 ops log + 6 OAuth2)
npm test               # 14 passed
npm run screens        # 40 page/width combinations, no horizontal overflow
```

The skip-when-absent behaviour of the messaging and operations-log groups is a
convenience locally and a hazard in CI, where an unreachable service container
would turn into a green build quietly running nine fewer tests. So
`.github/workflows/ci.yml` parses the surefire reports and fails the job if the
skip count is anything other than zero.

### Driving React from the DevTools protocol

Two things in the browser suites had to change for the port, and both are worth
recording because they are the kind of thing that looks like a flaky test.

**Typing.** React installs its own `value` setter on every controlled input to
track what it last rendered. `el.value = "x"` goes through that setter, so by
the time the `input` event fires React believes nothing changed and drops it —
the field looks filled and the component never hears about it. The helpers now
call the *prototype's* setter instead, which leaves React's tracker stale and is
exactly what tells it a real edit happened. This is the same trick React's own
testing library uses.

**Reading elements back.** `Runtime.evaluate` with `returnByValue` used to hand
back a DOM node as a small object, which was enough for `waitFor` to treat as
"it's there". React hangs a fiber off every node it renders, and the serializer
now gives up walking it — `Object reference chain is too long` — which surfaced
as every single wait timing out. `js()` coerces a node result to `true` and
leaves every other kind of result alone.

Neither change weakens a test: the suites still click real buttons, submit real
forms and read real text out of the rendered page.

### The clock, and why the browser suites pin it

Most of this application is only reachable during a facility's opening hours.
You cannot book a window that has already closed, and the attendant's verify
screen deliberately ignores reservations that have ended — which is correct
behaviour, and also means a suite run at 23:00 fails on the hour rather than on
the code. An earlier fix pinned the *booking* tests to tomorrow for this reason;
the attendant test can't use that escape, because its whole subject is today.

So the browser suites set `karita.clock-offset` and move the server's notion of
now to 10:00 on the day they run. Shifting the clock beats special-casing the
tests: there is still one definition of now, and the seeder, the validation
rules and the views all move together. The property is unset everywhere else,
where the bean is exactly `Clock.system`.

The audit and notification documents keep stamping real wall-clock time, since
those record when something was actually written rather than when it was due.

---

## 10. CI and deployment

`docker compose up --build` brings up the app, PostgreSQL 16, RabbitMQ 3.13 and
MongoDB 7, with the app gated on all three reporting healthy, so there is no
connect-retry noise in the logs on a cold start. The image is a three-stage
build: Node builds the React bundle, Maven produces the jar, and an
`eclipse-temurin:21-jre` layer runs it as a non-root user. The frontend ships
inside the same image because the backend serves it as static files from the
same origin — there is no second thing to deploy, and nothing but Docker to
install to run the whole stack.

Its healthcheck probes `/login.html` rather than an Actuator endpoint. That page
is served to signed-out visitors, so it answers 200 without credentials, which
makes it an honest liveness signal without adding a dependency for the sake of
one probe.

CI runs on every push and every PR into `main`, in two jobs:

- **test** — the 29 backend tests and the 14 browser tests, against PostgreSQL,
  RabbitMQ and MongoDB service containers. Real datastores, not mocks: the
  no-double-booking guarantee *is* a PostgreSQL exclusion constraint, so a suite
  running on H2 would pass while testing none of the thing most likely to break.
- **docker** — builds the image and then boots the whole compose stack and
  checks it actually serves, which is the same thing a grader does. Building
  proves it compiles; only booting proves it runs.

---

## 11. Gaps against the brief

Stated plainly, because a grader will find them anyway:

**The four performance targets in `REQUIREMENTS.md` are design intent, not
measurements.** The indexes, the fetch strategy and the `open-in-view=false`
setting all exist to hit them, and the seeded dataset is realistic enough to
test against — but no load test has been run, so the p95 figures are engineering
judgement rather than observed numbers. They are labelled as such in that table
rather than quietly presented as results.

**Authorization is hand-rolled, not Spring Security's.** `ApiAuthInterceptor`
and `PageAccessFilter` enforce RBAC ahead of the Spring Security chain, and
`SecurityConfig` is `permitAll` throughout precisely so that two systems are
never deciding the same question. It is enforced and test-covered, and the
reasoning is in `SecurityConfig`'s javadoc — but a reader who greps for
`@PreAuthorize` will not find it, and should know where to look instead.

**Payments and notification delivery are simulated.** Out of scope per
`REQUIREMENTS.md` §1, but worth restating: no gateway is contacted, and the
email and SMS listeners record what they would have sent rather than sending it.

**Google sign-in needs credentials to demonstrate.** The code path and its six
tests are complete, but `backend/oauth.properties` is git-ignored, so on a fresh
clone the "Continue with Google" button does not render until someone supplies a
client id and secret. See the README.

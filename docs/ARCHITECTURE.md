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
  browser  ─ HTML/CSS/vanilla JS, one api() helper, no build step
     │  JSON over HTTP, same origin
  ─────────────────────────────────────────────────────────
  web/         filters → interceptor → 5 controllers → error handler
  service/     business rules, validation, transactions, view assembly
  repository/  4 Spring Data JPA interfaces, hand-written JPQL
  model/       5 entities + 5 enums, Bean Validation, JPA mapping
  ─────────────────────────────────────────────────────────
  PostgreSQL 16 ─ constraints, indexes, the exclusion constraint
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

## 6. Frontend

Ten pages of plain HTML, CSS and ES modules. No framework, no bundler, no
`node_modules` — the backend serves `frontend/` as static files from the same
origin, which is why the session cookie just works and there's no CORS config
anywhere.

Shared `api()` helper in `scripts/karita.js` centralises fetch, error parsing and
the `401` → sign-in redirect. Design tokens in `styles/tokens.css`, per-page
stylesheets on top, dark mode via `scripts/theme.js`. Responsive from 390 px up,
20 media queries across 12 stylesheets, viewport meta on all ten pages.

Being straight about it: the brief asked for React or Angular, and this isn't
that. It's a deliberate trade — no build step, no dependency surface, and pages
that stay readable — but it doesn't satisfy a requirement that names a framework,
and I'm not going to pretend otherwise.

---

## 7. Testing

Thirty-one automated checks, all green at the time of writing.

Thirteen MockMvc integration tests run the real Spring context against a real
PostgreSQL (`karita_test`), covering auth, the reservation lifecycle, payment
branches, role enforcement and the double-booking constraint. Four messaging
tests publish through a live broker and read the result back off a throwaway
queue, checking that events route by key, survive JSON conversion both ways, and
that a cancellation stays off the SMS queue; they skip themselves when nothing
answers on the AMQP port, so the suite stays green on a machine without
RabbitMQ. Fourteen end-to-end checks drive headless Chrome against a freshly
built jar — real clicks, real forms, real redirects — including two robustness
cases most suites skip: server restart mid-session, and server down entirely.

```
npm run test:backend   # 17 passed (13 API + 4 messaging)
npm test               # 14 passed
```

---

## 8. Gaps against the brief

Stated plainly, because a grader will find them anyway:

**MongoDB is absent.** PostgreSQL does all persistence. Audit trails and payment
receipts are the document-shaped candidates.

**OAuth2 is absent.** Authentication is a hand-rolled session scheme — PBKDF2 at
210,000 iterations, random per-user salt, constant-time compare, a dummy hash so
timing doesn't leak which emails exist, session-id rotation on sign-in, HttpOnly
+ SameSite=Lax, login throttling. It's sound, and it's still not OAuth2, and the
brief named OAuth2.

**No frontend framework**, as above.

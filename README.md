# Karita

Multi-location parking slot reservation system: drivers browse facilities,
reserve and pay for a slot, and get a printable ticket; attendants verify plates
and run the live board for their facility; admins manage facilities, slots,
reservations and revenue.

```
frontend/   pages (HTML), styles/, scripts/ — plain HTML/CSS/JS, no build step
backend/    Spring Boot 4; PostgreSQL (core data), MongoDB (audit/notification
            documents), RabbitMQ (events); serves frontend/ and /api
docs/       the written documentation (see below)
tests/      end-to-end browser tests (headless Chrome)
```

## Documentation

| File | What's in it |
|---|---|
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | Problem, users, objectives, scope, three user stories with acceptance criteria, measurable quality targets |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | Conceptual domain, entity model, and the physical PostgreSQL schema with keys, indexes and constraints |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Architecture style and rationale, request path, concurrency, performance, testing, and known gaps |
| [`docs/API.md`](docs/API.md) | The API contract between frontend and backend |
| `docs/Parking_Slot_Reservation_Phase1_Documentation.docx` | Original Phase 1 submission — see the note below |

> **On the Phase 1 document:** it was written against a JSF + Hibernate prototype
> that was replaced in commit `15835ee`. Its problem statement, scope, AS-IS/TO-BE
> models and business requirements still stand. Its architecture (§7) and
> implementation sections (§10.4–10.7) describe code that no longer exists —
> `ARCHITECTURE.md` and `DATA-MODEL.md` supersede them.

One server, one origin: http://localhost:8080 serves the pages and the API, so
the session cookie just works (no CORS).

## Requirements

- Java 17+ (21 tested), PostgreSQL 14+ (16 tested) with the `btree_gist` extension available (standard in PostgreSQL)
- RabbitMQ 3.9+ for notification events — **optional**: set `NOTIFICATIONS=false` to run without it
- MongoDB 6+ for the audit and notification log — **optional**: set `AUDIT=false` to run without it
- Maven is optional (`backend/mvnw` downloads it)
- For the browser tests: Node 18+ and Chrome or Chromium

## Set up (once)

```
PGPASSWORD=3002 psql -h localhost -U postgres -c "CREATE DATABASE karita"
PGPASSWORD=3002 psql -h localhost -U postgres -c "CREATE DATABASE karita_test"
```

The login defaults to `postgres` / `3002`. Override with environment variables:
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (and `PORT` for the web port).

On first start the app creates the tables, adds the database constraints, and
seeds demo data (24 Kigali facilities, 1,476 slots, demo accounts, and about
15,000 bookings across two weeks back and one week ahead).

## Run

```
npm start            # or: cd backend && ./mvnw spring-boot:run
```

Without RabbitMQ or MongoDB running, start it as:

```
NOTIFICATIONS=false AUDIT=false npm start
```

Open **http://localhost:8080**. Data lives in PostgreSQL, so it survives restarts;
a restart only ends sessions (pages send you to sign-in with a "session ended" note).

To start over with fresh demo data: `DROP DATABASE karita; CREATE DATABASE karita;`.

## Google sign-in (optional)

Off until you give it credentials, because an empty client id stops Spring Boot
starting rather than disabling anything.

```
cp backend/oauth.properties.example backend/oauth.properties
# then paste your client id and secret into that file (it's git-ignored)
```

Create the client in the Google Cloud console under APIs & Services →
Credentials → OAuth client ID, type **Web application**, with authorised redirect
URI `http://localhost:8080/login/oauth2/code/google`.

With no such file the "Continue with Google" button simply doesn't render and
password sign-in works as before.

## Demo accounts

Password for all: `karita123`

| Role | Email | Lands on |
|---|---|---|
| Driver | `driver@karita.rw` (RAD 482 C, car) | `home.html` |
| Driver 2 | `driver2@karita.rw` (RAC 117 B, SUV) | `home.html` |
| Attendant (Kigali Heights) | `attendant@karita.rw` | `attendant.html` |
| Admin | `admin@karita.rw` | `admin.html` |

New drivers can sign up at `register.html`. Payments are **simulated** (the
documentation puts real gateways out of scope): Cash stays pending until the
attendant records it, card `4000 0000 0000 0002` always declines.

## Tests

```
npm run test:backend   # 29 tests: 14 API + 4 messaging + 5 operations log + 6 OAuth2
npm test               # 14 browser checks: builds the jar, runs it on karita_test
npm run test:all
```

The four messaging tests need a broker on `localhost:5672`, and the five
operations-log tests need MongoDB on `localhost:27017`; each group skips itself
when its server isn't there. Everything else runs with both switched off, so no
suite requires RabbitMQ or MongoDB.

Both use the `smoke` profile: database `karita_test`, rebuilt and reseeded on
each start. Don't run them at the same time (they share that database).

## How the two halves talk

- **Contract:** `docs/API.md`. Every front-end call goes through `api()` in
  `frontend/scripts/karita.js`.
- **Sessions:** server-side `HttpSession`, cookie `KARITA_SESSION` (HttpOnly,
  SameSite=Lax), 8-hour timeout, new session id at sign-in.
- **Sign-in:** password (PBKDF2, 210k iterations) or Google via OAuth2/OIDC with
  PKCE. Both end in the same session, so everything downstream is identical —
  see `docs/ARCHITECTURE.md §7`.
- **Errors:** always `{ "error", "field"?, "fields"? }`. `401` → the page sends
  you to sign-in and back; `fields`/`field` land under the matching input.
- **Page access:** `PageAccessFilter` sends each role to its own pages and adds
  `?reason=expired` when a session has ended.
- **CSRF:** API writes from another origin are rejected (`OriginCheckFilter`).
- **Double booking:** the service locks the slot row and re-checks, and
  PostgreSQL enforces it with an exclusion constraint on
  `(slot_id, tsrange(start_time, hold_until))` for confirmed reservations.
- **Time:** Africa/Kigali throughout; an injectable `Clock` drives every rule.
- **Notifications:** booking, payment and cancellation events publish to the
  `karita.events` topic exchange *after the transaction commits*, and are
  consumed by email and SMS listeners (delivery simulated — see
  `docs/ARCHITECTURE.md §5`). A broker that's down logs the dropped event and
  never fails the booking.
- **Operations log:** staff actions and sent notifications are append-only
  documents in MongoDB (`karita_ops`), readable at `/api/admin/audit` and
  `/api/admin/notifications`. Writes are best-effort for the same reason.

## Screens by requirement (Phase 1 documentation)

| BR | Screen |
|---|---|
| BR1 register / log in | `register.html`, `login.html` |
| BR2 slot status | `facility.html` (the lot), `attendant.html` (live board) |
| BR3 reserve | `facility.html` → `pay.html` → `ticket.html` |
| BR4 view / edit / cancel own | `reservations.html` |
| BR5 admin slot CRUD | `admin.html#slots` |
| BR6 admin all reservations | `admin.html#reservations` |
| BR7 no double-booking | service lock + database exclusion constraint |
| BR8 validation | client checks on every form; server re-validates; DB constraints |
| BR9 responsive CSS | all pages, 390px and up |
| BR10 admin facilities | `admin.html#facilities` |
| BR11 browse / filter | `browse.html` |
| BR12 attendant, own facility | `attendant.html` |
| BR13 payment record | `pay.html`, ticket, admin reservations |
| BR14 occupancy & revenue | `admin.html#revenue` |

Entities follow §10.1: `Facility`, `ParkingSlot`, `User`, `Reservation`,
`Payment` in `backend/src/main/java/auca/ac/rw/parkinkslotManagement/model`.

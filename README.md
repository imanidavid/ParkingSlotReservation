# Karita

Multi-location parking slot reservation system: drivers browse facilities,
reserve and pay for a slot, and get a printable ticket; attendants verify plates
and run the live board for their facility; admins manage facilities, slots,
reservations and revenue.

```
frontend/   pages (HTML), styles/, scripts/ — plain HTML/CSS/JS, no build step
backend/    Spring Boot 4 + JPA/Hibernate + PostgreSQL; serves frontend/ and /api
docs/API.md the API contract between the two
tests/      end-to-end browser tests (headless Chrome)
```

One server, one origin: http://localhost:8080 serves the pages and the API, so
the session cookie just works (no CORS).

## Requirements

- Java 17+ (21 tested), PostgreSQL 14+ (16 tested) with the `btree_gist` extension available (standard in PostgreSQL)
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

Open **http://localhost:8080**. Data lives in PostgreSQL, so it survives restarts;
a restart only ends sessions (pages send you to sign-in with a "session ended" note).

To start over with fresh demo data: `DROP DATABASE karita; CREATE DATABASE karita;`.

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
npm run test:backend   # 13 API integration tests (MockMvc) on karita_test
npm test               # 14 browser checks: builds the jar, runs it on karita_test
npm run test:all
```

Both use the `smoke` profile: database `karita_test`, rebuilt and reseeded on
each start. Don't run them at the same time (they share that database).

## How the two halves talk

- **Contract:** `docs/API.md`. Every front-end call goes through `api()` in
  `frontend/scripts/karita.js`.
- **Sessions:** server-side `HttpSession`, cookie `KARITA_SESSION` (HttpOnly,
  SameSite=Lax), 8-hour timeout, new session id at sign-in.
- **Errors:** always `{ "error", "field"?, "fields"? }`. `401` → the page sends
  you to sign-in and back; `fields`/`field` land under the matching input.
- **Page access:** `PageAccessFilter` sends each role to its own pages and adds
  `?reason=expired` when a session has ended.
- **CSRF:** API writes from another origin are rejected (`OriginCheckFilter`).
- **Double booking:** the service locks the slot row and re-checks, and
  PostgreSQL enforces it with an exclusion constraint on
  `(slot_id, tsrange(start_time, hold_until))` for confirmed reservations.
- **Time:** Africa/Kigali throughout; an injectable `Clock` drives every rule.

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

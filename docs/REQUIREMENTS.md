# Karita — Requirements, User Stories & Quality Targets

Supplements the Phase 1 documentation. Where the two disagree, this file wins —
Phase 1 was written against the original JSF prototype, which was replaced in
commit `15835ee`.

---

## 1. Problem, users, objectives

Parking at most Kigali campuses, office towers and malls still runs on a simple
rule: turn up and hope. Drivers circle. Attendants arbitrate. And nobody, at the
end of the month, can say with any confidence how full a given basement actually
was or how much cash it took in, because the only record — if one exists at all —
is a paper notebook at the barrier.

Karita digitises that. Three groups use it, and they want quite different things:

**Drivers** want certainty before they leave the house. Which lot has space at
14:00, what it costs, and a guarantee the bay is still theirs when they arrive.

**Attendants** work at the barrier with a queue behind them. Their need is
narrow but sharp — type a plate, get an answer in under a second, wave the car
through or turn it away. Anything slower than the gate itself is useless.

**Admins** sit above the lots. Slots and pricing to maintain, occupancy and
revenue to read across every facility at once.

### Objectives

| # | Objective | How we'll know |
|---|---|---|
| O1 | Remove the search-for-a-bay problem | A confirmed reservation names an exact level and bay before arrival |
| O2 | Make double-booking structurally impossible | Enforced in the database, not just in application code |
| O3 | Give every parking event a record | Every reservation carries a payment row; occupancy is timestamped |
| O4 | Scope attendants to their own site | An attendant cannot read or write another facility's data |
| O5 | Consolidate the view across locations | One revenue and occupancy report spanning all facilities |

### Scope

In: registration and sign-in across three roles, multi-facility management,
live availability, reservation create/read/update/cancel, slot and facility
CRUD, payment recording, occupancy and revenue reporting, responsive UI.

Out: real payment gateways (simulated in-app), barrier and ANPR hardware,
native mobile apps, surge pricing and discount codes.

---

## 2. User stories

### US-1 — Driver reserves and pays for a bay

> As a **driver**, I want to pick a specific bay at a specific facility for a
> specific time window and pay for it up front, so that I can drive straight to
> a space I know is mine instead of circling the basement.

Covers BR3, BR7, BR13.

**Acceptance criteria**

| | Given | When | Then |
|---|---|---|---|
| AC-1.1 | I'm signed in as a driver and bay B1/A1 at Kigali Heights is free 08:00–12:00 | I reserve it for that window with plate `RAD 482 C` | The response is `201` and the reservation reads `Confirmed`, payment `Pending` |
| AC-1.2 | I hold that confirmed reservation | Another driver tries the same bay for any overlapping window | They get `409` and a message naming the clash; their reservation is never written |
| AC-1.3 | My reservation is `Pending` | I pay by mobile money with a valid `+2507…` number | Payment flips to `Paid`, `paidAt` is stamped, the ticket renders as PAID |
| AC-1.4 | My reservation is `Pending` | I pay with card `4000 0000 0000 0002` | I get `402`, the error names the decline, the form keeps what I typed, status stays `Pending` |
| AC-1.5 | I ask for a bay smaller than my vehicle | I submit | `400` with the error attached to the `vehicle` field |

Verified by `ApiIntegrationTest` and the browser checks *"reserve with plate, pay
by mobile money, see the PAID ticket"* and *"declined card shows an error and
keeps the form"*.

---

### US-2 — Attendant verifies a car at the barrier

> As an **attendant**, I want to type a plate and immediately see whether that
> car has a paid booking at *my* facility today, so that I can clear the queue at
> the gate without phoning anyone or guessing.

Covers BR2, BR12.

**Acceptance criteria**

| | Given | When | Then |
|---|---|---|---|
| AC-2.1 | I'm an attendant assigned to Kigali Heights | I search plate `RAD 482 C`, which holds a paid booking there today | I see the bay, window, payment status and a control to mark it occupied |
| AC-2.2 | The same plate holds a booking at a **different** facility | I search it | `404` and the no-match panel — other sites are invisible to me |
| AC-2.3 | A booking is `Paid` and the driver has arrived | I mark it occupied | `checkedInAt` is stamped and the bay shows `Occupied` on the live board |
| AC-2.4 | A booking is still `Pending` (cash) | I try to mark it occupied | Blocked until I record the cash payment |
| AC-2.5 | A booking started more than 15 minutes ago, nobody arrived | I mark it a no-show | Status becomes `No-show` and the bay returns to the pool |

Verified by *"attendant: verify plate, mark occupied, release the slot"*,
*"attendant: unknown plate shows the no-match panel"* and *"roles: each role is
kept to its own pages"*.

---

### US-3 — Admin maintains slots and reads the money

> As an **admin**, I want to add, edit and retire bays across any facility, and
> see occupancy and revenue broken down per site, so that I can plan capacity on
> numbers rather than on what the attendants tell me.

Covers BR5, BR10, BR14.

**Acceptance criteria**

| | Given | When | Then |
|---|---|---|---|
| AC-3.1 | I'm an admin | I create bay `A13` on level B1 at a facility | `201`, and the bay appears immediately in the driver-facing map |
| AC-3.2 | A bay already exists as B1/A13 at that facility | I create it again | `400` — `(facility, level, slot_number)` is unique |
| AC-3.3 | A bay carries upcoming confirmed bookings | I delete it | `409` naming the count; nothing is deleted |
| AC-3.4 | A facility has reservation history | I delete the facility | `409`; history is never orphaned |
| AC-3.5 | Paid reservations exist across several facilities | I open the revenue report | Each facility's total equals the sum of its `Paid` amounts, and the grand total equals the sum of the rows |

Verified by *"admin: facility and slot CRUD with validation"*, *"a facility with
history can't be deleted"* and *"reservations list filters, revenue table totals"*.

---

## 3. Measurable quality attributes

Phase 1 listed these as adjectives — "fast retrieval", "simple forms". That's not
much use to anyone, since you can't fail an adjective. So each one below gets a
number and a way to check it.

| Attribute | Target | How it's measured | Status |
|---|---|---|---|
| **Performance** — availability map | Facility map for one level renders in **< 500 ms** at p95, dataset of 24 facilities / 1,476 bays / ~15,000 bookings | Server timing on `GET /api/facilities/{id}` under the seeded dataset | Design target; not yet load-tested |
| **Performance** — plate lookup | Attendant verify answers in **< 300 ms** at p95 | `GET /api/attendant/verify`; backed by `ix_res_facility_start` | Design target; not yet load-tested |
| **Performance** — write path | Reservation create completes in **< 1 s** including the row lock | `POST /api/reservations` | Design target |
| **Reliability** — no double-booking | **Zero** overlapping confirmed bookings on one bay, under concurrent load | PostgreSQL `EXCLUDE USING gist` constraint; a DB-level violation is raised even if application code is bypassed | **Met** — enforced and test-covered |
| **Reliability** — durability | Data survives restart; only sessions are lost | Restart check in the browser suite | **Met** |
| **Security** — credentials at rest | PBKDF2-HMAC-SHA256, **≥ 200,000** iterations, per-user random salt | `PasswordHasher` — currently 210,000 | **Met** |
| **Security** — brute force | Sign-in throttled to **10 failures** per email+IP per **15 min**, then `429` | `LoginThrottle` | **Met** |
| **Security** — isolation | **0** cross-tenant reads: an attendant reaching another facility's data gets 403/404 in 100% of attempts | Role checks plus per-resource ownership checks | **Met** — test-covered |
| **Usability** — booking effort | A signed-in driver reaches a confirmed booking in **≤ 4 screens** and **≤ 8 fields** | Walkthrough: home → facility → bay → pay | **Met** |
| **Usability** — error clarity | **100%** of validation errors render against the specific field, in plain language, with input preserved | `{fields}` error envelope | **Met** |
| **Responsiveness** | No horizontal scroll and no overlap from **390 px** to **1920 px** on all 10 pages | Manual check at 390/768/1280/1920 | **Met** |
| **Maintainability** | Layers stay one-directional: `web → service → repository → model` | No repository import in `web/`, no servlet import in `service/` | **Met** |

The honest caveat: the four performance rows marked *design target* are
engineering intent, not measured results. The indexes and fetch strategy exist to
hit them — but nobody's run a load test yet, and I'd rather label that gap than
quietly present a guess as a measurement.

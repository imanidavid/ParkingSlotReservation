# Karita — Domain & Data Model

Three passes over the same thing, getting progressively more concrete: the
conceptual domain, then the entity model, then the physical PostgreSQL schema as
it actually exists on disk.

The class diagram in the Phase 1 document still holds for the five core entities
and their relationships. What it doesn't show is everything the implementation
added afterwards — `hold_until`, the check-in timestamps, facility rates and
codes — so treat §3 here as the current truth.

---

## 1. Conceptual model

### Actors

**Driver** (`USER`) — owns a vehicle, holds reservations, pays. Sees only their
own bookings.

**Attendant** (`ATTENDANT`) — staff at exactly one facility. Doesn't book
anything; verifies arrivals, records cash, releases bays. Everything they touch
is filtered by their assigned site.

**Admin** (`ADMIN`) — maintains facilities, bays and pricing across every site,
and reads consolidated reports. No facility assignment, because they're above all
of them.

### Processes

*Registration* turns a visitor into a driver with a plate and a vehicle class.
*Availability* answers which bays are free in a window — the one read that has to
be fast, and the one every other process depends on. *Reservation* claims a bay
for a window; this is where double-booking either gets prevented or doesn't.
*Payment* settles a reservation, by card or mobile money up front, or by cash at
the barrier. *Check-in* and *release* bracket the physical occupancy. *No-show*
is the timeout branch when nobody turns up. And *reporting* aggregates the lot.

### Data objects

A **Facility** is a parking site with an address, a nightly-flat hourly rate, and
named levels. A **ParkingSlot** is one physical bay on one level, sized for a
vehicle class. A **User** is any account, discriminated by role. A
**Reservation** is the central object — one driver, one bay, one window, one
status. A **Payment** settles exactly one reservation.

One concept deserves a note, because it isn't obvious and it drives the schema:
the window a bay is *held* for is not the window the driver *booked*. A driver
books 08:00–12:00. They leave at 09:30. From 09:30 the bay should be bookable
again. So `hold_until` tracks the real hold and shrinks on release, while
`end_time` preserves what was agreed and billed. Every conflict check runs
against `hold_until`; every receipt runs against `end_time`.

### Relationships

A Facility has many ParkingSlots (`1 : N`, mandatory on the slot side). A Facility
has many Reservations. A User makes many Reservations (`1 : N`). A User who is an
attendant is assigned to at most one Facility (`0..1`, null for drivers and
admins). A ParkingSlot is booked in many Reservations over time (`1 : N`, but
constrained so their held windows never overlap). A Reservation has exactly one
Payment (`1 : 1`).

---

## 2. Entity model

| Entity | Identity | Key attributes |
|---|---|---|
| Facility | `facilityId` | `code`, `name`, `address`, `city`, `type`, `rate`, `levels`, `active` |
| ParkingSlot | `slotId` | `facility`, `level`, `slotNumber`, `vehicleType`, `active` |
| User | `userId` | `fullName`, `email`, `passwordHash`, `role`, `plate`, `vehicleType`, `assignedFacility` |
| Reservation | `reservationId` | `user`, `facility`, `slot`, `slotLevel`, `slotNumber`, `vehiclePlate`, `vehicleType`, `startTime`, `endTime`, `holdUntil`, `status`, `amount`, `checkedInAt`, `releasedAt`, `createdAt` |
| Payment | `paymentId` | `reservation`, `amount`, `method`, `status`, `reference`, `detail`, `paidAt` |

Enumerations are stored as strings and constrained in the database, not left as
free text: role (`USER`/`ATTENDANT`/`ADMIN`), vehicle type
(`MOTORCYCLE`/`CAR`/`SUV`/`TRUCK`), reservation status
(`CONFIRMED`/`CANCELLED`/`NO_SHOW`), payment status (`PENDING`/`PAID`/`FAILED`),
payment method (`CASH`/`MOBILE_MONEY`/`CARD`).

`Reservation.slotLevel` and `slotNumber` duplicate what the slot already knows.
That's deliberate denormalisation — an admin can delete a bay, which nulls
`slot_id` via `ON DELETE SET NULL`, and without the snapshot every historical
receipt for that bay would lose the one detail a driver cares about. History
stays readable after the thing it points at is gone.

---

## 3. Physical schema (PostgreSQL 16)

Taken from the running database, not from the annotations.

### `facilities`

| Column | Type | Null | Notes |
|---|---|---|---|
| `facility_id` | `bigint` | NO | **PK**, identity |
| `code` | `varchar(60)` | NO | **UNIQUE** — URL-safe slug |
| `name` | `varchar(80)` | NO | **UNIQUE** |
| `address` | `varchar(120)` | NO | |
| `city` | `varchar(60)` | NO | |
| `type` | `varchar(20)` | NO | Campus / Office / Mall / Public |
| `rate` | `integer` | NO | RWF per hour; **CHECK** 100–20,000 |
| `levels` | `varchar(40)` | NO | e.g. `"B1, B2"` |
| `active` | `boolean` | NO | |

### `users`

| Column | Type | Null | Notes |
|---|---|---|---|
| `user_id` | `bigint` | NO | **PK**, identity |
| `email` | `varchar(120)` | NO | **UNIQUE** |
| `full_name` | `varchar(80)` | NO | |
| `password_hash` | `varchar(200)` | NO | `pbkdf2$iterations$salt$hash` |
| `role` | `varchar(12)` | NO | **CHECK** in the three roles |
| `plate` | `varchar(12)` | YES | drivers only |
| `vehicle_type` | `varchar(12)` | YES | **CHECK**; drivers only |
| `assigned_facility_id` | `bigint` | YES | **FK** → `facilities` — attendants only |

### `parking_slots`

| Column | Type | Null | Notes |
|---|---|---|---|
| `slot_id` | `bigint` | NO | **PK**, identity |
| `facility_id` | `bigint` | NO | **FK** → `facilities` |
| `level` | `varchar(3)` | NO | |
| `slot_number` | `varchar(5)` | NO | |
| `vehicle_type` | `varchar(12)` | NO | **CHECK**; bay size |
| `active` | `boolean` | NO | false = out of service |

**UNIQUE** `uk_slot_number (facility_id, level, slot_number)` — one bay label per
level per site.

### `reservations`

| Column | Type | Null | Notes |
|---|---|---|---|
| `reservation_id` | `bigint` | NO | **PK**, sequence, allocation 50 |
| `user_id` | `bigint` | NO | **FK** → `users` |
| `facility_id` | `bigint` | NO | **FK** → `facilities` |
| `slot_id` | `bigint` | YES | **FK** → `parking_slots` **ON DELETE SET NULL** |
| `slot_level` | `varchar(3)` | NO | snapshot |
| `slot_number` | `varchar(5)` | NO | snapshot |
| `vehicle_plate` | `varchar(12)` | NO | |
| `vehicle_type` | `varchar(12)` | NO | **CHECK** |
| `start_time` | `timestamp` | NO | local, Africa/Kigali |
| `end_time` | `timestamp` | NO | agreed and billed end |
| `hold_until` | `timestamp` | NO | real hold; shrinks on release |
| `status` | `varchar(12)` | NO | **CHECK** in the three statuses |
| `amount` | `integer` | NO | RWF; **CHECK** ≥ 0 |
| `checked_in_at` | `timestamptz` | YES | |
| `released_at` | `timestamptz` | YES | |
| `created_at` | `timestamptz` | NO | |

Indexes: `ix_res_facility_start (facility_id, start_time)` serves the attendant
board and the admin list; `ix_res_user (user_id)` serves "my reservations";
`ix_res_slot (slot_id)` serves conflict checks and slot deletion.

Constraints:

- `reservations_time_order` — `end_time > start_time AND hold_until BETWEEN start_time AND end_time`
- `reservations_amount_positive` — `amount >= 0`
- **`reservations_no_overlap`** — `EXCLUDE USING gist (slot_id WITH =, tsrange(start_time, hold_until) WITH &&) WHERE (status = 'CONFIRMED' AND slot_id IS NOT NULL)`

That last one is the load-bearing wall of the whole system, so it's worth saying
plainly what it does. It makes two confirmed bookings that overlap on the same
bay *unrepresentable*. Not discouraged — unrepresentable. The service layer also
takes a `PESSIMISTIC_WRITE` lock on the bay row and re-checks before inserting,
which gives the driver a clean `409` instead of a stack trace. But if that check
were deleted tomorrow, or somebody ran an `INSERT` by hand in `psql`, the
database would still refuse. The partial `WHERE` matters too: cancelled and
no-show rows fall outside the constraint, so a cancelled booking frees its bay
instantly. GiST plus `btree_gist` is what lets one index mix the equality on
`slot_id` with the range overlap.

### `payments`

| Column | Type | Null | Notes |
|---|---|---|---|
| `payment_id` | `bigint` | NO | **PK** |
| `reservation_id` | `bigint` | NO | **FK** → `reservations`, **UNIQUE** — enforces 1:1 |
| `amount` | `integer` | NO | RWF |
| `method` | `varchar(16)` | YES | **CHECK**; null until chosen |
| `status` | `varchar(10)` | NO | **CHECK** |
| `reference` | `varchar(80)` | NO | |
| `detail` | `varchar(40)` | NO | masked card tail / phone |
| `paid_at` | `timestamptz` | YES | set on success |

---

## 4. Notes and known rough edges

Times split deliberately: business times (`start_time`, `end_time`,
`hold_until`) are `timestamp` *without* zone and always read as Africa/Kigali,
because a 08:00 booking means 08:00 at the gate regardless of server locale.
Audit times (`created_at`, `paid_at`, `checked_in_at`, `released_at`) are
`timestamptz` — those are instants.

Reservation ids come from a sequence with `allocationSize = 50` rather than
identity, which lets Hibernate batch inserts (the seeder writes ~15,000 rows in
about 7 seconds). The visible side effect is gaps in the serial numbers. Harmless,
but worth knowing before someone files it as a bug.

Two rough edges I'd fix given time. First, `facilities` carries a duplicate check
constraint — `facilities_rate_check` generated from the Bean Validation
annotations and `facilities_rate_range` added by `SchemaInitializer`, both
asserting 100–20,000. Redundant, not wrong. Second, foreign keys are still on
Hibernate's generated names (`fka0t6epq80cb9fwefvastfqsg7` and friends), which
are stable but unreadable; explicit `@ForeignKey` names would make production
error messages far easier to follow.

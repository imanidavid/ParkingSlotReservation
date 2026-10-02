# Karita API

JSON over HTTP, same origin as the pages (http://localhost:8080). Sessions use
the `KARITA_SESSION` cookie (HttpOnly, SameSite=Lax), set by login/register.

## Conventions

- **Times** are Africa/Kigali local time. `start`/`end` are `yyyy-MM-ddTHH:mm`;
  `paidAt`, `checkedInAt`, `releasedAt` are ISO-8601 instants (`…Z`).
- **Money** is whole RWF (`amount`, `rate`, `price`).
- **Serial**: a reservation's `reservationId` zero-padded to 5 digits (`"00412"`).
  URLs use the serial.
- **Errors** always look like `{ "error": "message", "field"?: "name", "fields"?: { "name": "message" } }`.
  Messages are written for end users; the front end shows them as-is.
  - `400` bad input (`field` or `fields` say where)
  - `401` not signed in — the front end redirects to `login.html?reason=expired&next=…`
  - `402` payment declined (also returns `reservation`)
  - `403` wrong role, or a cross-origin write
  - `404` not found / not yours
  - `409` conflict (slot taken, state doesn't allow it, has history…)
  - `429` too many sign-in attempts
- **Writes** (`POST`/`PATCH`/`DELETE`) from another origin are rejected (403).

## Enumerations

| Name | Values |
|---|---|
| role | `user`, `attendant`, `admin` |
| vehicle type | `Motorcycle`, `Car`, `SUV`, `Truck` (a vehicle fits a bay of its size or larger) |
| facility type | `Campus`, `Office`, `Mall`, `Public` |
| duration id | `1h`, `2h`, `4h`, `8h`, `day` (06:00→22:00, billed as 8h) |
| reservation status | `Confirmed`, `Cancelled`, `No-show` |
| payment status | `Pending`, `Paid`, `Failed` |
| payment method | `Cash`, `Mobile Money`, `Card` |
| display (pill) | `Confirmed`, `Paid`, `Cancelled`, `No-show` |
| slot status | `Available`, `Reserved`, `Occupied`, `Inactive` |
| day state (attendant/admin) | `Due`, `Late`, `Parked`, `Left`, `No-show`, `Cancelled`, `Ended` |

## Shapes

**Reservation**
```json
{
  "reservationId": 412, "serial": "00412",
  "facilityId": "kigali-heights", "facility": "Kigali Heights",
  "slotId": 5, "level": "B1", "slot": "A1",
  "date": "2026-10-02", "start": "2026-10-02T08:00", "end": "2026-10-02T12:00",
  "duration": "4 HOURS", "plate": "RAD 482 C", "vehicle": "Car",
  "amount": 2000, "rate": 500,
  "status": "Confirmed",
  "payment": { "status": "Pending", "method": null, "reference": "", "detail": "", "paidAt": null },
  "display": "Confirmed",
  "can": { "pay": true, "reschedule": true, "cancel": true }
}
```
Attendant views add `checkedInAt`, `releasedAt`, `state`, `startsIn` (minutes), `canNoShow`.
Admin views add `user` (email) and `state`.

**Slot cell** (in `rows[].slots[]`): `{ slotId, id: "A1", col: 1, vehicleType, fits, status }`.

## Auth

| Method & path | Body | Response |
|---|---|---|
| `POST /api/auth/login` | `{ email, password }` | `200 { redirect, user: { email, role } }`, `401`, `429` |
| `POST /api/auth/register` | `{ fullName, email, password, plate, vehicle }` | `201` like login; `400`/`409` with `fields` |
| `GET /api/auth/me` | | `{ fullName, email, role, plate, vehicle, facility }` (`facility` = attendant's facility name) |
| `GET /logout` | | ends the session, `302 → /login.html` |

Register rules: fullName 2–80; valid email ≤120, unique; password 8–128 with a
letter and a digit; plate 4–12 of A–Z/0–9/space with a digit; vehicle type.

## Driver (role `user`)

| Method & path | Notes |
|---|---|
| `GET /api/home` | `{ user, upcoming: Reservation\|null, facilities: [top 5 by availability], facilityCount, past: [5] }` |
| `GET /api/facilities?date&duration` | `{ today, date, duration, window: {start,end}\|null, facilities: [{ id, name, address, city, type, vehicles, totalSlots, available, rateFrom, sampleTraffic }], facilityTypes, vehicleTypes }` |
| `GET /api/facilities/{id}?level&date&duration&start&vehicle` | `{ facility: { id, name, address, city, type, vehicles, rate, levels, sampleTraffic }, level, date, minDate, maxDate, duration, vehicle, vehicleTypes, durations: [{id,label,price}], start, startTimes, window, cols, rows: [{ row, slots }] }` |
| `POST /api/reservations` | `{ facilityId, level, slot, date, start, duration, plate, vehicle }` → `201 { reservation }`; `400` with `field` (`plate`, `vehicle`, `date`, `start`); `409` taken / out of service |
| `GET /api/reservations` | `{ upcoming: [...], past: [...] }` |
| `GET /api/reservations/{serial}` | `{ reservation }` |
| `PATCH /api/reservations/{serial}` | `{ start: "yyyy-MM-dd HH:mm", end }` → `{ reservation }`; `400`/`409` with `field` (`start`/`end`) |
| `POST /api/reservations/{serial}/cancel` | `{ reservation }`; `409` once started |
| `POST /api/reservations/{serial}/payment` | `{ method, phone?, cardNumber?, expiry?, cvc?, reference? }` → `{ reservation }`; `400 { fields }`; `402 { error, reservation }`; `409` not payable |

Reschedule rules: format `yyyy-MM-dd HH:mm`; minutes `:00`/`:30`; start in the
future and within 30 days; 06:00–22:00 same day; at least 1 hour; a paid
reservation keeps its length; slot free in the new window.

Payment (simulated): Cash stays `Pending` until the attendant records it; Mobile
Money needs a Rwandan number (`+2507[2389]XXXXXXX`); Card is Luhn-checked with a
future `MM/YY` and 3–4 digit CVC; card `4000 0000 0000 0002` always declines.

## Attendant (role `attendant`, own facility only)

| Method & path | Notes |
|---|---|
| `GET /api/attendant/board` | `{ facility: {id,name}, asOf, date, sampleTraffic, counts: {Available,Reserved,Occupied,Inactive}, levels: [{ name, cols, rows }] }` (next hour) |
| `GET /api/attendant/today` | `{ reservations: [attendant view] }` |
| `GET /api/attendant/verify?plate=` or `?slot=B1 A1` | `{ reservation }`, `404` no match |
| `POST /api/attendant/reservations/{serial}/occupy` | needs payment `Paid` |
| `POST …/cash` | records a cash payment |
| `POST …/release` | car left; frees the slot from now |
| `POST …/no-show` | 15 min after start, if not checked in |

## Admin (role `admin`)

| Method & path | Notes |
|---|---|
| `GET /api/admin/facilities` | `{ facilities: [{ id, name, address, city, type, rate, levels, active, totalSlots, activeSlots, upcoming, sampleTraffic }], facilityTypes, vehicleTypes }` |
| `POST /api/admin/facilities` | `{ name, address, city, type, rate, levels: "B1, B2" }` → `201 { facility }` |
| `PATCH /api/admin/facilities/{id}` | any of the above + `active` → `{ facility }` |
| `DELETE /api/admin/facilities/{id}` | `{ ok: true }`; `409` if it has reservation history or an attendant |
| `GET /api/admin/slots?facility&level` | `{ slots: [{ slotId, facilityId, facility, level, slotNumber, vehicleType, active, status, upcoming }] }` |
| `POST /api/admin/slots` | `{ facilityId, level, slotNumber, vehicleType }` → `201 { slot }` |
| `PATCH /api/admin/slots/{slotId}` | any of `level, slotNumber, vehicleType, active` → `{ slot }` |
| `DELETE /api/admin/slots/{slotId}` | `{ ok: true }`; `409` with upcoming reservations |
| `GET /api/admin/reservations?facility&status&date` | `{ reservations: [admin view] }`; status: `Upcoming`, a display value, or a status |
| `POST /api/admin/reservations/{serial}/cancel` | `{ reservation }` |
| `GET /api/admin/audit?action&facility&limit` | `{ events: [{ at, action, actor, role, target, facility, details }], limit }` — MongoDB; `details` shape varies by action; newest first, limit 1–500 (default 100) |
| `GET /api/admin/notifications?serial&limit` | `{ notifications: [{ at, channel, event, serial, to, subject, body, characters }], limit }` — MongoDB; `subject` is null for SMS |
| `GET /api/admin/revenue` | `{ asOf, since, until, rows: [{ id, name, active, slots, occupied, reserved, occupancy, reservations, revenue, pending, sampleTraffic }], total }` |

Facility/slot validation errors return `400 { error, fields }` keyed by the
request field names.

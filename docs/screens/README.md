# Responsive screenshots

Every page of the application at four viewport widths. These are the mock-ups
for requirement 3 — they show how each layout adapts between a small phone and a
desktop monitor.

They are generated, not hand-made: `npm run screens` boots the app on the
throwaway `karita_test` database, drives headless Chrome through each page at
each width, and writes the images here. The same pass checks every page for
horizontal overflow and fails if any of them scrolls sideways, which is what
backs the responsiveness row in [`../REQUIREMENTS.md`](../REQUIREMENTS.md).
Current result: 40/40 clean.

Shots are capped at 1,400 px tall. The attendant board and admin tables run to
several thousand pixels on seeded data, and a mock-up should show the layout
rather than sixty rows of it.

| Width | Stands in for |
|---|---|
| 390 px | iPhone 12/13 mini — the narrowest width the CSS claims to support |
| 768 px | iPad, portrait |
| 1280 px | Laptop |
| 1920 px | Desktop monitor |


## The pages

### Sign in — `login.html`

Password form, plus the Google button when OAuth2 credentials are configured.

[390 px](login-390.png) · [768 px](login-768.png) · [1280 px](login-1280.png) · [1920 px](login-1920.png)

### Register — `register.html`

Driver sign-up, with per-field validation.

[390 px](register-390.png) · [768 px](register-768.png) · [1280 px](register-1280.png) · [1920 px](register-1920.png)

### Driver home — `home.html`

Upcoming bookings and the entry point to browsing.

[390 px](home-390.png) · [768 px](home-768.png) · [1280 px](home-1280.png) · [1920 px](home-1920.png)

### Browse facilities — `browse.html`

All 24 facilities, filterable.

[390 px](browse-390.png) · [768 px](browse-768.png) · [1280 px](browse-1280.png) · [1920 px](browse-1920.png)

### Facility bay map — `facility.html`

One level of one facility: which bays are free for the chosen window.

[390 px](facility-390.png) · [768 px](facility-768.png) · [1280 px](facility-1280.png) · [1920 px](facility-1920.png)

### Payment — `pay.html`

Mobile money or card against a pending reservation.

[390 px](pay-390.png) · [768 px](pay-768.png) · [1280 px](pay-1280.png) · [1920 px](pay-1920.png)

### Ticket — `ticket.html`

The printable stub, stamped PAID.

[390 px](ticket-390.png) · [768 px](ticket-768.png) · [1280 px](ticket-1280.png) · [1920 px](ticket-1920.png)

### My reservations — `reservations.html`

View, reschedule and cancel.

[390 px](reservations-390.png) · [768 px](reservations-768.png) · [1280 px](reservations-1280.png) · [1920 px](reservations-1920.png)

### Attendant board — `attendant.html`

Plate verification and the live slot board for one facility.

[390 px](attendant-390.png) · [768 px](attendant-768.png) · [1280 px](attendant-1280.png) · [1920 px](attendant-1920.png)

### Admin console — `admin.html`

Facilities, slots, reservations and revenue.

[390 px](admin-390.png) · [768 px](admin-768.png) · [1280 px](admin-1280.png) · [1920 px](admin-1920.png)

package auca.ac.rw.parkinkslotManagement.service;

import auca.ac.rw.parkinkslotManagement.messaging.Events;
import auca.ac.rw.parkinkslotManagement.model.Facility;
import auca.ac.rw.parkinkslotManagement.model.ParkingSlot;
import auca.ac.rw.parkinkslotManagement.model.Payment;
import auca.ac.rw.parkinkslotManagement.model.PaymentStatus;
import auca.ac.rw.parkinkslotManagement.model.Reservation;
import auca.ac.rw.parkinkslotManagement.model.ReservationStatus;
import auca.ac.rw.parkinkslotManagement.model.User;
import auca.ac.rw.parkinkslotManagement.model.VehicleType;
import auca.ac.rw.parkinkslotManagement.repository.FacilityRepository;
import auca.ac.rw.parkinkslotManagement.repository.ParkingSlotRepository;
import auca.ac.rw.parkinkslotManagement.repository.ReservationRepository;
import auca.ac.rw.parkinkslotManagement.repository.UserRepository;
import auca.ac.rw.parkinkslotManagement.web.ApiException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** A driver's own reservations: reserve, list, pay, cancel, reschedule. */
@Service
@Transactional
public class ReservationService {

    private final ReservationRepository reservations;
    private final ParkingSlotRepository slots;
    private final FacilityRepository facilities;
    private final UserRepository users;
    private final PaymentService payments;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public ReservationService(
            ReservationRepository reservations, ParkingSlotRepository slots, FacilityRepository facilities,
            UserRepository users, PaymentService payments, ApplicationEventPublisher events, Clock clock) {
        this.reservations = reservations;
        this.slots = slots;
        this.facilities = facilities;
        this.users = users;
        this.payments = payments;
        this.events = events;
        this.clock = clock;
    }

    public record PayResult(Map<String, Object> reservation, String declined) {}

    private LocalDateTime now() {
        return LocalDateTime.now(clock);
    }

    /** The reservation with this serial, if it belongs to the user. */
    private Reservation own(Long userId, String serial) {
        long id;
        try {
            id = Long.parseLong(serial);
        } catch (NumberFormatException e) {
            throw ApiException.notFound("Reservation not found.");
        }
        return reservations.findById(id)
                .filter(r -> r.getUser().getUserId().equals(userId))
                .orElseThrow(() -> ApiException.notFound("Reservation not found."));
    }

    @Transactional(readOnly = true)
    public Map<String, Object> listFor(Long userId) {
        LocalDateTime now = now();
        User user = users.findById(userId).orElseThrow();
        List<Reservation> mine = reservations.findByUserWithDetails(user);
        List<Map<String, Object>> upcoming = mine.stream()
                .filter(r -> r.getStatus() == ReservationStatus.CONFIRMED && !Views.ended(r, now))
                .sorted(Comparator.comparing(Reservation::getStartTime))
                .map(r -> Views.reservation(r, now)).toList();
        List<Map<String, Object>> past = mine.stream()
                .filter(r -> r.getStatus() != ReservationStatus.CONFIRMED || Views.ended(r, now))
                .sorted(Comparator.comparing(Reservation::getStartTime).reversed())
                .map(r -> Views.reservation(r, now)).toList();
        return Map.of("upcoming", upcoming, "past", past);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> get(Long userId, String serial) {
        return Views.reservation(own(userId, serial), now());
    }

    public Map<String, Object> reserve(Long userId, Map<String, Object> body) {
        LocalDateTime now = now();
        LocalDate today = now.toLocalDate();
        User user = users.findById(userId).orElseThrow();

        Facility f = facilities.findByCode(Body.str(body, "facilityId")).filter(Facility::isActive)
                .orElseThrow(() -> ApiException.notFound("Facility not found."));
        String number = Body.str(body, "slot");
        ParkingSlot slot = slots.findByFacilityAndLevelAndSlotNumber(f, Body.str(body, "level"), number)
                .orElseThrow(() -> ApiException.badRequest("Pick a slot."));
        if (!slot.isActive()) throw ApiException.conflict(number + " is out of service. Pick another slot.");
        Hours.Duration dur = Hours.duration(Body.str(body, "duration"))
                .orElseThrow(() -> ApiException.badRequest("Pick a duration."));

        String plate = AuthService.cleanPlate(Body.str(body, "plate"))
                .orElseThrow(() -> ApiException.field("plate", "Enter the vehicle plate, e.g. RAD 482 C."));
        VehicleType vehicle = VehicleType.fromLabel(Body.str(body, "vehicle"))
                .orElseThrow(() -> ApiException.field("vehicle", "Choose the vehicle type."));
        if (!slot.getVehicleType().fits(vehicle)) {
            throw ApiException.field("vehicle", number + " is a " + slot.getVehicleType().label().toLowerCase()
                    + " bay; a " + vehicle.label().toLowerCase() + " won't fit.");
        }

        LocalDate date = Hours.parseDate(Body.str(body, "date"))
                .filter(d -> !d.isBefore(today) && !d.isAfter(today.plusDays(Hours.HORIZON_DAYS)))
                .orElseThrow(() -> ApiException.field("date", "Pick a date within the next " + Hours.HORIZON_DAYS + " days."));
        List<String> starts = Hours.startTimes(date, dur, now);
        String start = dur.id().equals("day") ? (starts.isEmpty() ? null : starts.get(0)) : Body.str(body, "start");
        if (start == null || !starts.contains(start)) {
            throw ApiException.field("start", "That start time is no longer available.");
        }
        Hours.Window win = Hours.window(date, start, dur);

        // One booking at a time per slot: lock it, then re-check.
        ParkingSlot locked = slots.lockById(slot.getSlotId()).orElseThrow();
        if (reservations.isHeld(locked, win.start(), win.end(), null)) {
            throw ApiException.conflict(number + " was just taken for that time. Pick another slot.");
        }

        Reservation r = new Reservation();
        r.setUser(user);
        r.setFacility(f);
        r.setSlot(locked);
        r.setSlotLevel(locked.getLevel());
        r.setSlotNumber(locked.getSlotNumber());
        r.setVehiclePlate(plate);
        r.setVehicleType(vehicle);
        r.setStartTime(win.start());
        r.setEndTime(win.end());
        r.setHoldUntil(win.end());
        r.setAmount(Hours.priceForMinutes(f.getRate(), ChronoUnit.MINUTES.between(win.start(), win.end())));
        Payment p = new Payment();
        p.setAmount(r.getAmount());
        r.attachPayment(p);
        try {
            reservations.saveAndFlush(r);
        } catch (DataIntegrityViolationException e) {
            throw ApiException.conflict(number + " was just taken for that time. Pick another slot.");
        }
        events.publishEvent(Events.confirmed(r));
        return Views.reservation(r, now);
    }

    public PayResult pay(Long userId, String serial, Map<String, Object> body) {
        LocalDateTime now = now();
        Reservation r = own(userId, serial);
        if (!Views.canPay(r, now)) throw ApiException.conflict("This reservation can't be paid any more.");
        PaymentService.Checked checked = payments.validate(body, now.toLocalDate());
        PaymentService.Outcome outcome = payments.charge(checked);

        Payment p = r.getPayment();
        p.setStatus(outcome.status());
        p.setMethod(outcome.method());
        p.setDetail(outcome.detail());
        p.setReference(outcome.reference());
        p.setAmount(r.getAmount());
        p.setPaidAt(outcome.status() == PaymentStatus.PAID ? clock.instant() : null);
        if (outcome.status() == PaymentStatus.PAID) events.publishEvent(Events.paid(r));
        return new PayResult(Views.reservation(r, now), outcome.error());
    }

    public Map<String, Object> cancel(Long userId, String serial) {
        LocalDateTime now = now();
        Reservation r = own(userId, serial);
        if (!Views.canChange(r, now)) {
            throw ApiException.conflict("This reservation has started or already ended, so it can't be cancelled.");
        }
        r.setStatus(ReservationStatus.CANCELLED);
        events.publishEvent(Events.cancelled(r));
        return Views.reservation(r, now);
    }

    public Map<String, Object> reschedule(Long userId, String serial, Map<String, Object> body) {
        LocalDateTime now = now();
        LocalDateTime nowMin = Hours.minute(now);
        Reservation r = own(userId, serial);
        if (!Views.canChange(r, now)) {
            throw ApiException.conflict("This reservation has started or ended, so it can't be rescheduled.");
        }

        LocalDateTime s = Hours.parseInput(Body.str(body, "start"))
                .orElseThrow(() -> ApiException.field("start", "Use the format yyyy-MM-dd HH:mm."));
        LocalDateTime e = Hours.parseInput(Body.str(body, "end"))
                .orElseThrow(() -> ApiException.field("end", "Use the format yyyy-MM-dd HH:mm."));
        if (s.getMinute() % 30 != 0) throw ApiException.field("start", "Start on the hour or half hour.");
        if (e.getMinute() % 30 != 0) throw ApiException.field("end", "End on the hour or half hour.");
        if (!s.isAfter(nowMin)) throw ApiException.field("start", "Start must be in the future.");
        if (s.toLocalDate().isAfter(now.toLocalDate().plusDays(Hours.HORIZON_DAYS))) {
            throw ApiException.field("start", "Start must be within the next " + Hours.HORIZON_DAYS + " days.");
        }
        if (s.toLocalTime().isBefore(Hours.OPEN)) throw ApiException.field("start", "The facility opens at " + Hours.hm(Hours.OPEN) + ".");
        if (!e.toLocalDate().equals(s.toLocalDate())) throw ApiException.field("end", "End must be on the same day as start.");
        if (!e.isAfter(s)) throw ApiException.field("end", "End must be after start.");
        if (e.toLocalTime().isAfter(Hours.CLOSE)) throw ApiException.field("end", "The facility closes at " + Hours.hm(Hours.CLOSE) + ".");
        long minutes = ChronoUnit.MINUTES.between(s, e);
        if (minutes < Hours.MIN_STAY_MIN) throw ApiException.field("end", "The minimum stay is 1 hour.");

        long length = ChronoUnit.MINUTES.between(r.getStartTime(), r.getEndTime());
        boolean paid = Views.paid(r);
        if (paid && minutes != length) {
            throw ApiException.field("end", "This reservation is paid, so it must stay "
                    + Hours.durationText(length).toLowerCase() + " long.");
        }

        ParkingSlot slot = r.getSlot();
        if (slot == null || !slot.isActive()) {
            throw ApiException.conflict("This slot is out of service. Cancel and book another.");
        }
        ParkingSlot locked = slots.lockById(slot.getSlotId()).orElseThrow();
        String taken = locked.getSlotNumber() + " is already taken in that window. Try another time.";
        if (reservations.isHeld(locked, s, e, r.getReservationId())) {
            throw ApiException.field(HttpStatus.CONFLICT, "start", taken);
        }

        r.setStartTime(s);
        r.setEndTime(e);
        r.setHoldUntil(e);
        if (!paid) {
            r.setAmount(Hours.priceForMinutes(r.getFacility().getRate(), minutes));
            r.getPayment().setAmount(r.getAmount());
        }
        try {
            reservations.flush();
        } catch (DataIntegrityViolationException ex) {
            throw ApiException.field(HttpStatus.CONFLICT, "start", taken);
        }
        return Views.reservation(r, now);
    }

    Optional<Reservation> findBySerial(String serial) {
        try {
            return reservations.findById(Long.parseLong(serial));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    public Map<String, Object> view(Reservation r) {
        return new LinkedHashMap<>(Views.reservation(r, now()));
    }
}

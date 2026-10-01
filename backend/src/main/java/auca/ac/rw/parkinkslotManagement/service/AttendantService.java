package auca.ac.rw.parkinkslotManagement.service;

import auca.ac.rw.parkinkslotManagement.model.Facility;
import auca.ac.rw.parkinkslotManagement.model.ParkingSlot;
import auca.ac.rw.parkinkslotManagement.model.Payment;
import auca.ac.rw.parkinkslotManagement.model.PaymentMethod;
import auca.ac.rw.parkinkslotManagement.model.PaymentStatus;
import auca.ac.rw.parkinkslotManagement.model.Reservation;
import auca.ac.rw.parkinkslotManagement.model.ReservationStatus;
import auca.ac.rw.parkinkslotManagement.model.User;
import auca.ac.rw.parkinkslotManagement.repository.ParkingSlotRepository;
import auca.ac.rw.parkinkslotManagement.repository.ReservationRepository;
import auca.ac.rw.parkinkslotManagement.repository.UserRepository;
import auca.ac.rw.parkinkslotManagement.web.ApiException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The on-site attendant's work, scoped to their assigned facility (BR12). */
@Service
@Transactional
public class AttendantService {

    private final UserRepository users;
    private final ReservationRepository reservations;
    private final ParkingSlotRepository slots;
    private final AvailabilityService availability;
    private final Clock clock;

    public AttendantService(
            UserRepository users, ReservationRepository reservations, ParkingSlotRepository slots,
            AvailabilityService availability, Clock clock) {
        this.users = users;
        this.reservations = reservations;
        this.slots = slots;
        this.availability = availability;
        this.clock = clock;
    }

    private Facility facilityOf(Long userId) {
        User u = users.findById(userId).orElseThrow();
        if (u.getAssignedFacility() == null) throw ApiException.forbidden("No facility is assigned to this account.");
        return u.getAssignedFacility();
    }

    private List<Reservation> today(Facility f, LocalDateTime now) {
        LocalDate day = now.toLocalDate();
        return reservations.findAtFacilityStarting(f, day.atStartOfDay(), day.plusDays(1).atStartOfDay());
    }

    private Reservation atFacility(Facility f, String serial) {
        try {
            return reservations.findById(Long.parseLong(serial))
                    .filter(r -> r.getFacility().getFacilityId().equals(f.getFacilityId()))
                    .orElseThrow(() -> ApiException.notFound("Reservation not found at this facility."));
        } catch (NumberFormatException e) {
            throw ApiException.notFound("Reservation not found at this facility.");
        }
    }

    private static String currentLevel(Reservation r) {
        return r.getSlot() == null ? r.getSlotLevel() : r.getSlot().getLevel();
    }

    private static String currentNumber(Reservation r) {
        return r.getSlot() == null ? r.getSlotNumber() : r.getSlot().getSlotNumber();
    }

    @Transactional(readOnly = true)
    public Map<String, Object> todayList(Long userId) {
        LocalDateTime now = LocalDateTime.now(clock);
        List<Map<String, Object>> list = today(facilityOf(userId), now).stream()
                .filter(r -> r.getStatus() != ReservationStatus.CANCELLED)
                .map(r -> Views.attendant(r, now)).toList();
        return Map.of("reservations", list);
    }

    /** Today's usable booking by plate, or by slot ("A1" or "B1 A1"). */
    @Transactional(readOnly = true)
    public Optional<Map<String, Object>> verify(Long userId, String plate, String slot) {
        LocalDateTime now = LocalDateTime.now(clock);
        List<Reservation> open = today(facilityOf(userId), now).stream()
                .filter(r -> r.getStatus() == ReservationStatus.CONFIRMED && !Views.ended(r, now) && r.getReleasedAt() == null)
                .toList();
        Optional<Reservation> match = Optional.empty();
        if (plate != null && !plate.isBlank()) {
            String wanted = plate.toUpperCase().replaceAll("[^A-Z0-9]", "");
            match = open.stream()
                    .filter(r -> r.getVehiclePlate().replaceAll("[^A-Z0-9]", "").equals(wanted))
                    .findFirst();
        } else if (slot != null && !slot.isBlank()) {
            String[] parts = slot.toUpperCase().trim().split("[\\s·-]+");
            String number = parts[parts.length - 1];
            String level = parts.length > 1 ? parts[parts.length - 2] : null;
            match = open.stream()
                    .filter(r -> currentNumber(r).equals(number) && (level == null || currentLevel(r).equals(level)))
                    .findFirst();
        }
        return match.map(r -> Views.attendant(r, now));
    }

    public Map<String, Object> occupy(Long userId, String serial) {
        LocalDateTime now = LocalDateTime.now(clock);
        Reservation r = atFacility(facilityOf(userId), serial);
        if (r.getStatus() != ReservationStatus.CONFIRMED || Views.ended(r, now)) {
            throw ApiException.conflict("This reservation is no longer valid.");
        }
        if (!r.getStartTime().toLocalDate().equals(now.toLocalDate())) {
            throw ApiException.conflict("This reservation is not for today.");
        }
        if (!Views.paid(r)) throw ApiException.conflict("Collect payment before marking the slot occupied.");
        if (r.getCheckedInAt() == null) r.setCheckedInAt(clock.instant());
        return Views.attendant(r, now);
    }

    public Map<String, Object> cash(Long userId, String serial) {
        LocalDateTime now = LocalDateTime.now(clock);
        Reservation r = atFacility(facilityOf(userId), serial);
        if (r.getStatus() != ReservationStatus.CONFIRMED || Views.ended(r, now)) {
            throw ApiException.conflict("This reservation is no longer valid.");
        }
        Payment p = r.getPayment();
        if (p.getStatus() != PaymentStatus.PAID) {
            p.setStatus(PaymentStatus.PAID);
            p.setMethod(PaymentMethod.CASH);
            p.setDetail("Collected at entry");
            p.setAmount(r.getAmount());
            p.setPaidAt(clock.instant());
        }
        return Views.attendant(r, now);
    }

    /** The car left: the slot is free again from now (TO-BE step 6). */
    public Map<String, Object> release(Long userId, String serial) {
        LocalDateTime now = LocalDateTime.now(clock);
        Reservation r = atFacility(facilityOf(userId), serial);
        if (r.getCheckedInAt() == null) throw ApiException.conflict("This car was never marked as occupied.");
        if (r.getReleasedAt() == null) {
            r.setReleasedAt(clock.instant());
            LocalDateTime nowMin = Hours.minute(now);
            LocalDateTime until = nowMin.isBefore(r.getStartTime()) ? r.getStartTime() : nowMin;
            if (until.isBefore(r.getHoldUntil())) r.setHoldUntil(until);
        }
        return Views.attendant(r, now);
    }

    public Map<String, Object> noShow(Long userId, String serial) {
        LocalDateTime now = LocalDateTime.now(clock);
        Reservation r = atFacility(facilityOf(userId), serial);
        if (!Boolean.TRUE.equals(Views.attendant(r, now).get("canNoShow"))) {
            throw ApiException.conflict("A no-show can be marked " + Hours.NO_SHOW_GRACE_MIN
                    + " minutes after the start time, if the car hasn't arrived.");
        }
        r.setStatus(ReservationStatus.NO_SHOW);
        return Views.attendant(r, now);
    }

    /** Wall board: every slot's status for the next hour. */
    @Transactional(readOnly = true)
    public Map<String, Object> board(Long userId) {
        LocalDateTime now = LocalDateTime.now(clock);
        Facility f = facilityOf(userId);
        LocalDateTime from = Hours.minute(now);
        LocalDateTime to = from.plusMinutes(60);
        Map<Long, List<Reservation>> held = availability.holding(f, from, to);
        List<ParkingSlot> all = slots.findByFacility(f);

        List<Map<String, Object>> levels = new ArrayList<>();
        for (String level : f.levelList()) {
            List<ParkingSlot> levelSlots = all.stream().filter(s -> s.getLevel().equals(level)).toList();
            AvailabilityService.Grid g = availability.grid(levelSlots, from, to, now, held, null);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", level);
            m.put("cols", g.cols());
            m.put("rows", g.rows());
            levels.add(m);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("facility", Map.of("id", f.getCode(), "name", f.getName()));
        out.put("asOf", Hours.hm(now));
        out.put("date", now.toLocalDate().toString());
        out.put("sampleTraffic", false);
        out.put("counts", AvailabilityService.counts(all, from, to, now, held));
        out.put("levels", levels);
        return out;
    }
}

package auca.ac.rw.parkinkslotManagement.service;

import auca.ac.rw.parkinkslotManagement.model.Facility;
import auca.ac.rw.parkinkslotManagement.model.ParkingSlot;
import auca.ac.rw.parkinkslotManagement.model.Payment;
import auca.ac.rw.parkinkslotManagement.model.PaymentStatus;
import auca.ac.rw.parkinkslotManagement.model.Reservation;
import auca.ac.rw.parkinkslotManagement.model.ReservationStatus;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;

/** Reservation JSON in the shapes the pages read (see docs/API.md). */
public final class Views {

    private Views() {}

    public static boolean ended(Reservation r, LocalDateTime now) {
        return !r.getHoldUntil().isAfter(Hours.minute(now));
    }

    public static boolean started(Reservation r, LocalDateTime now) {
        return !r.getStartTime().isAfter(Hours.minute(now));
    }

    static boolean open(Reservation r, LocalDateTime now) {
        return r.getStatus() == ReservationStatus.CONFIRMED && !ended(r, now);
    }

    public static boolean paid(Reservation r) {
        return r.getPayment().getStatus() == PaymentStatus.PAID;
    }

    public static String display(Reservation r) {
        if (r.getStatus() == ReservationStatus.CONFIRMED && paid(r)) return "Paid";
        return r.getStatus().label();
    }

    public static boolean canPay(Reservation r, LocalDateTime now) {
        return open(r, now) && !paid(r);
    }

    public static boolean canChange(Reservation r, LocalDateTime now) {
        return open(r, now) && !started(r, now);
    }

    /** Where a reservation stands on the day: Due, Late, Parked, Left, No-show, Cancelled, Ended. */
    public static String dayState(Reservation r, LocalDateTime now) {
        if (r.getStatus() == ReservationStatus.NO_SHOW) return "No-show";
        if (r.getStatus() == ReservationStatus.CANCELLED) return "Cancelled";
        if (r.getReleasedAt() != null) return "Left";
        if (r.getCheckedInAt() != null) return ended(r, now) ? "Ended" : "Parked";
        if (ended(r, now)) return "Ended";
        if (r.getStartTime().toLocalDate().isAfter(now.toLocalDate())) return "Due";
        return started(r, now) ? "Late" : "Due";
    }

    private static String iso(Instant t) {
        return t == null ? null : t.toString();
    }

    public static Map<String, Object> reservation(Reservation r, LocalDateTime now) {
        Facility f = r.getFacility();
        ParkingSlot slot = r.getSlot();
        Payment p = r.getPayment();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("reservationId", r.getReservationId());
        m.put("serial", r.serial());
        m.put("facilityId", f.getCode());
        m.put("facility", f.getName());
        m.put("slotId", slot == null ? null : slot.getSlotId());
        m.put("level", slot == null ? r.getSlotLevel() : slot.getLevel());
        m.put("slot", slot == null ? r.getSlotNumber() : slot.getSlotNumber());
        m.put("date", r.getStartTime().toLocalDate().toString());
        m.put("start", Hours.stamp(r.getStartTime()));
        m.put("end", Hours.stamp(r.getEndTime()));
        m.put("duration", Hours.durationText(r.getStartTime(), r.getEndTime()));
        m.put("plate", r.getVehiclePlate());
        m.put("vehicle", r.getVehicleType().label());
        m.put("amount", r.getAmount());
        m.put("rate", f.getRate());
        m.put("status", r.getStatus().label());
        Map<String, Object> pay = new LinkedHashMap<>();
        pay.put("status", p.getStatus().label());
        pay.put("method", p.getMethod() == null ? null : p.getMethod().label());
        pay.put("reference", p.getReference());
        pay.put("detail", p.getDetail());
        pay.put("paidAt", iso(p.getPaidAt()));
        m.put("payment", pay);
        m.put("display", display(r));
        m.put("can", Map.of(
                "pay", canPay(r, now),
                "reschedule", canChange(r, now),
                "cancel", canChange(r, now)));
        return m;
    }

    public static Map<String, Object> attendant(Reservation r, LocalDateTime now) {
        Map<String, Object> m = reservation(r, now);
        String state = dayState(r, now);
        LocalDateTime nowMin = Hours.minute(now);
        m.put("checkedInAt", iso(r.getCheckedInAt()));
        m.put("releasedAt", iso(r.getReleasedAt()));
        m.put("state", state);
        m.put("startsIn", r.getStartTime().isAfter(nowMin) ? ChronoUnit.MINUTES.between(nowMin, r.getStartTime()) : 0);
        m.put("canNoShow", state.equals("Late")
                && !nowMin.isBefore(r.getStartTime().plusMinutes(Hours.NO_SHOW_GRACE_MIN)));
        return m;
    }

    public static Map<String, Object> admin(Reservation r, LocalDateTime now) {
        Map<String, Object> m = reservation(r, now);
        m.put("user", r.getUser().getEmail());
        m.put("state", dayState(r, now));
        return m;
    }
}

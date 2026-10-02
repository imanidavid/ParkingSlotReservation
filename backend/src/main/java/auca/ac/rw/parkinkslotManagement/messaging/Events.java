package auca.ac.rw.parkinkslotManagement.messaging;

import auca.ac.rw.parkinkslotManagement.model.Payment;
import auca.ac.rw.parkinkslotManagement.model.Reservation;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

/** Builds events from a reservation, so the services don't have to. */
public final class Events {

    /** Readable in a text message: "Fri 3 Oct, 08:00". */
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("EEE d MMM, HH:mm");

    private Events() {}

    public static KaritaEvent.ReservationConfirmed confirmed(Reservation r) {
        return new KaritaEvent.ReservationConfirmed(
                id(), now(), r.serial(),
                r.getUser().getEmail(), r.getUser().getFullName(),
                r.getFacility().getName(), r.getSlotLevel(), r.getSlotNumber(),
                WHEN.format(r.getStartTime()), WHEN.format(r.getEndTime()),
                r.getVehiclePlate(), r.getAmount());
    }

    public static KaritaEvent.PaymentReceived paid(Reservation r) {
        Payment p = r.getPayment();
        return new KaritaEvent.PaymentReceived(
                id(), now(), r.serial(),
                r.getUser().getEmail(), r.getUser().getFullName(),
                r.getFacility().getName(),
                p.getMethod() == null ? "Unknown" : p.getMethod().label(),
                p.getReference(), p.getDetail(), p.getAmount());
    }

    public static KaritaEvent.ReservationCancelled cancelled(Reservation r) {
        return new KaritaEvent.ReservationCancelled(
                id(), now(), r.serial(),
                r.getUser().getEmail(), r.getUser().getFullName(),
                r.getFacility().getName(), WHEN.format(r.getStartTime()));
    }

    /** Lets a consumer drop a duplicate if the broker redelivers. */
    private static String id() {
        return UUID.randomUUID().toString();
    }

    private static String now() {
        return Instant.now().toString();
    }
}

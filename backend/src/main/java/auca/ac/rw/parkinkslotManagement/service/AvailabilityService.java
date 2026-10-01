package auca.ac.rw.parkinkslotManagement.service;

import auca.ac.rw.parkinkslotManagement.model.Facility;
import auca.ac.rw.parkinkslotManagement.model.ParkingSlot;
import auca.ac.rw.parkinkslotManagement.model.Reservation;
import auca.ac.rw.parkinkslotManagement.model.VehicleType;
import auca.ac.rw.parkinkslotManagement.repository.ReservationRepository;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/**
 * Slot status for a time window, from confirmed reservations only:
 * Available, Reserved, Occupied (checked in and inside its window now) or Inactive.
 */
@Service
public class AvailabilityService {

    public static final String AVAILABLE = "Available";
    public static final String RESERVED = "Reserved";
    public static final String OCCUPIED = "Occupied";
    public static final String INACTIVE = "Inactive";

    private static final Pattern NUMBER = Pattern.compile("^([A-Z]+)(\\d+)$");

    private final ReservationRepository reservations;

    public AvailabilityService(ReservationRepository reservations) {
        this.reservations = reservations;
    }

    public record Cell(Long slotId, String id, int col, String vehicleType, boolean fits, String status) {}

    public record Row(String row, List<Cell> slots) {}

    public record Grid(int cols, List<Row> rows) {}

    /** Confirmed bookings holding slots in [from, to), by slot id. facility null = everywhere. */
    public Map<Long, List<Reservation>> holding(Facility facility, LocalDateTime from, LocalDateTime to) {
        List<Reservation> list = facility == null
                ? reservations.findHolding(from, to)
                : reservations.findHoldingAt(facility, from, to);
        Map<Long, List<Reservation>> bySlot = new HashMap<>();
        for (Reservation r : list) {
            bySlot.computeIfAbsent(r.getSlot().getSlotId(), k -> new ArrayList<>()).add(r);
        }
        return bySlot;
    }

    public static String status(
            ParkingSlot slot, LocalDateTime from, LocalDateTime to, LocalDateTime now,
            Long exceptId, List<Reservation> held) {
        if (!slot.isActive()) return INACTIVE;
        if (held != null) {
            for (Reservation r : held) {
                if (r.getReservationId().equals(exceptId)) continue;
                LocalDateTime end = r.getHoldUntil();
                if (r.getStartTime().isBefore(to) && from.isBefore(end)) {
                    boolean inside = !now.isBefore(r.getStartTime()) && now.isBefore(end);
                    return r.getCheckedInAt() != null && inside ? OCCUPIED : RESERVED;
                }
            }
        }
        return AVAILABLE;
    }

    /** "A12" -> ["A", 12]; anything else sorts into row "·". */
    static Object[] split(String slotNumber) {
        Matcher m = NUMBER.matcher(slotNumber);
        return m.matches() ? new Object[] {m.group(1), Integer.parseInt(m.group(2))} : new Object[] {"·", 0};
    }

    public static Comparator<ParkingSlot> slotOrder() {
        return Comparator.comparing(ParkingSlot::getLevel)
                .thenComparing(s -> (String) split(s.getSlotNumber())[0])
                .thenComparingInt(s -> (Integer) split(s.getSlotNumber())[1]);
    }

    /** One level as rows by letter, slots placed by number (gaps allowed). */
    public Grid grid(
            List<ParkingSlot> levelSlots, LocalDateTime from, LocalDateTime to, LocalDateTime now,
            Map<Long, List<Reservation>> held, VehicleType vehicle) {
        Map<String, List<Cell>> byRow = new TreeMap<>();
        int cols = 0;
        for (ParkingSlot s : levelSlots) {
            Object[] parts = split(s.getSlotNumber());
            String row = (String) parts[0];
            int n = (Integer) parts[1];
            cols = Math.max(cols, n);
            byRow.computeIfAbsent(row, k -> new ArrayList<>()).add(new Cell(
                    s.getSlotId(),
                    s.getSlotNumber(),
                    n,
                    s.getVehicleType().label(),
                    vehicle == null || s.getVehicleType().fits(vehicle),
                    status(s, from, to, now, null, held.get(s.getSlotId()))));
        }
        List<Row> rows = new ArrayList<>();
        byRow.forEach((row, cells) -> {
            cells.sort(Comparator.comparingInt(Cell::col).thenComparing(Cell::id));
            rows.add(new Row(row, cells));
        });
        return new Grid(Math.max(cols, 1), rows);
    }

    public static Map<String, Integer> counts(
            Collection<ParkingSlot> slots, LocalDateTime from, LocalDateTime to, LocalDateTime now,
            Map<Long, List<Reservation>> held) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (String k : List.of(AVAILABLE, RESERVED, OCCUPIED, INACTIVE)) counts.put(k, 0);
        for (ParkingSlot s : slots) {
            counts.merge(status(s, from, to, now, null, held.get(s.getSlotId())), 1, Integer::sum);
        }
        return counts;
    }

    /** Vehicle types that fit at least one active bay. */
    public static List<String> vehiclesFor(Collection<ParkingSlot> slots) {
        return Arrays.stream(VehicleType.values())
                .filter(v -> slots.stream().anyMatch(s -> s.isActive() && s.getVehicleType().fits(v)))
                .map(VehicleType::label)
                .toList();
    }
}

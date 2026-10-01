package auca.ac.rw.parkinkslotManagement.service;

import auca.ac.rw.parkinkslotManagement.model.Facility;
import auca.ac.rw.parkinkslotManagement.model.ParkingSlot;
import auca.ac.rw.parkinkslotManagement.model.PaymentStatus;
import auca.ac.rw.parkinkslotManagement.model.Reservation;
import auca.ac.rw.parkinkslotManagement.model.ReservationStatus;
import auca.ac.rw.parkinkslotManagement.model.VehicleType;
import auca.ac.rw.parkinkslotManagement.repository.FacilityRepository;
import auca.ac.rw.parkinkslotManagement.repository.ParkingSlotRepository;
import auca.ac.rw.parkinkslotManagement.repository.ReservationRepository;
import auca.ac.rw.parkinkslotManagement.repository.UserRepository;
import auca.ac.rw.parkinkslotManagement.web.ApiException;
import java.text.Normalizer;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Facilities and slot CRUD (BR5, BR10), all reservations (BR6), occupancy & revenue (BR14). */
@Service
@Transactional
public class AdminService {

    /** Most reservations the admin list returns at once. */
    static final int LIST_LIMIT = 300;

    private final FacilityRepository facilities;
    private final ParkingSlotRepository slots;
    private final ReservationRepository reservations;
    private final UserRepository users;
    private final AvailabilityService availability;
    private final Clock clock;

    public AdminService(
            FacilityRepository facilities, ParkingSlotRepository slots, ReservationRepository reservations,
            UserRepository users, AvailabilityService availability, Clock clock) {
        this.facilities = facilities;
        this.slots = slots;
        this.reservations = reservations;
        this.users = users;
        this.availability = availability;
        this.clock = clock;
    }

    private LocalDateTime now() {
        return LocalDateTime.now(clock);
    }

    private Facility facility(String code) {
        return facilities.findByCode(code).orElseThrow(() -> ApiException.notFound("Facility not found."));
    }

    // ---- facilities ------------------------------------------------------------

    private static Map<Long, Long> countMap(List<Object[]> rows) {
        Map<Long, Long> m = new HashMap<>();
        for (Object[] row : rows) m.put((Long) row[0], (Long) row[1]);
        return m;
    }

    private Map<String, Object> facilityJson(Facility f, Collection<ParkingSlot> fs, long upcoming) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", f.getCode());
        m.put("name", f.getName());
        m.put("address", f.getAddress());
        m.put("city", f.getCity());
        m.put("type", f.getType());
        m.put("rate", f.getRate());
        m.put("levels", f.levelList());
        m.put("active", f.isActive());
        m.put("totalSlots", fs.size());
        m.put("activeSlots", fs.stream().filter(ParkingSlot::isActive).count());
        m.put("upcoming", upcoming);
        m.put("sampleTraffic", false);
        return m;
    }

    private Map<String, Object> facilityJson(Facility f) {
        return facilityJson(f, slots.findByFacility(f), reservations.countUpcomingAtFacility(f, now()));
    }

    @Transactional(readOnly = true)
    public Map<String, Object> facilities() {
        Map<Long, List<ParkingSlot>> bySlot = slots.findAllWithFacility().stream()
                .collect(Collectors.groupingBy(s -> s.getFacility().getFacilityId()));
        Map<Long, Long> upcoming = countMap(reservations.countUpcomingByFacility(now()));
        List<Map<String, Object>> list = facilities.findAllByOrderByFacilityIdAsc().stream()
                .map(f -> facilityJson(f, bySlot.getOrDefault(f.getFacilityId(), List.of()),
                        upcoming.getOrDefault(f.getFacilityId(), 0L)))
                .toList();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("facilities", list);
        out.put("facilityTypes", Facility.TYPES);
        out.put("vehicleTypes", VehicleType.labels());
        return out;
    }

    private static String slugify(String s) {
        String slug = Normalizer.normalize(s.toLowerCase(), Normalizer.Form.NFKD)
                .replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
        return slug.length() > 40 ? slug.substring(0, 40) : slug;
    }

    private static List<String> parseLevels(Object raw) {
        String text = raw instanceof Collection<?> c
                ? c.stream().map(String::valueOf).collect(Collectors.joining(","))
                : raw == null ? "" : String.valueOf(raw);
        return new ArrayList<>(new LinkedHashSet<>(Arrays.stream(text.toUpperCase().split("[\\s,]+"))
                .filter(s -> !s.isBlank()).toList()));
    }

    /** Validates facility fields; `existing` null = create (all required). Applies changes on success. */
    private void applyFacility(Facility f, Map<String, Object> body, boolean create) {
        Map<String, String> fields = new LinkedHashMap<>();
        if (create || Body.has(body, "name")) {
            String name = Body.str(body, "name").trim();
            if (name.length() < 2 || name.length() > 80) fields.put("name", "2–80 characters.");
            else if (!name.equalsIgnoreCase(f.getName() == null ? "" : f.getName()) && facilities.existsByNameIgnoreCase(name)) {
                fields.put("name", "A facility with this name already exists.");
            } else f.setName(name);
        }
        if (create || Body.has(body, "address")) {
            String address = Body.str(body, "address").trim();
            if (address.length() < 2 || address.length() > 120) fields.put("address", "2–120 characters.");
            else f.setAddress(address);
        }
        if (create || Body.has(body, "city")) {
            String city = Body.str(body, "city").trim();
            if (city.length() < 2 || city.length() > 60) fields.put("city", "2–60 characters.");
            else f.setCity(city);
        }
        if (create || Body.has(body, "type")) {
            String type = Body.str(body, "type");
            if (!Facility.TYPES.contains(type)) fields.put("type", "Choose a type.");
            else f.setType(type);
        }
        if (create || Body.has(body, "rate")) {
            Double rate = null;
            try {
                rate = Double.valueOf(Body.str(body, "rate").trim());
            } catch (NumberFormatException ignored) {
                // reported below
            }
            if (rate == null || rate % 1 != 0 || rate < 100 || rate > 20000) fields.put("rate", "Whole RWF between 100 and 20,000.");
            else f.setRate(rate.intValue());
        }
        if (create || Body.has(body, "levels")) {
            List<String> list = parseLevels(body.get("levels"));
            if (list.isEmpty() || list.size() > 8 || list.stream().anyMatch(l -> !l.matches("[A-Z0-9]{1,3}"))) {
                fields.put("levels", "1–8 level names, comma-separated, e.g. B1, B2.");
            } else if (!create) {
                List<String> used = f.levelList().stream()
                        .filter(l -> !list.contains(l) && slots.existsByFacilityAndLevel(f, l)).toList();
                if (!used.isEmpty()) fields.put("levels", "Level " + String.join(", ", used) + " still has slots. Delete or move them first.");
                else f.setLevelList(list);
            } else f.setLevelList(list);
        }
        if (!fields.isEmpty()) throw ApiException.fields(fields);
    }

    public Map<String, Object> createFacility(Map<String, Object> body) {
        Facility f = new Facility();
        applyFacility(f, body, true);
        String base = slugify(f.getName());
        if (base.isEmpty()) base = "facility";
        String code = base;
        for (int n = 2; facilities.existsByCode(code); n++) code = base + "-" + n;
        f.setCode(code);
        f.setActive(true);
        facilities.save(f);
        return Map.of("facility", facilityJson(f, List.of(), 0));
    }

    public Map<String, Object> updateFacility(String code, Map<String, Object> body) {
        Facility f = facility(code);
        boolean wasActive = f.isActive();
        applyFacility(f, body, false);
        if (Body.has(body, "active")) {
            boolean active = Boolean.parseBoolean(Body.str(body, "active"));
            if (!active && wasActive) {
                long upcoming = reservations.countUpcomingAtFacility(f, now());
                if (upcoming > 0) {
                    throw ApiException.conflict(f.getName() + " has " + upcoming
                            + " upcoming reservation(s). Cancel them before deactivating.");
                }
            }
            f.setActive(active);
        }
        return Map.of("facility", facilityJson(f));
    }

    public Map<String, Object> deleteFacility(String code) {
        Facility f = facility(code);
        if (users.countByAssignedFacility(f) > 0) {
            throw ApiException.conflict("An attendant is assigned to this facility. Reassign them first.");
        }
        if (reservations.existsByFacility(f)) {
            throw ApiException.conflict("This facility has reservation history. Deactivate it instead of deleting.");
        }
        slots.deleteByFacility(f);
        facilities.delete(f);
        return Map.of("ok", true);
    }

    // ---- slots -------------------------------------------------------------------

    private Map<String, Object> slotJson(ParkingSlot s, LocalDateTime now, Map<Long, List<Reservation>> held, long upcoming) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("slotId", s.getSlotId());
        m.put("facilityId", s.getFacility().getCode());
        m.put("facility", s.getFacility().getName());
        m.put("level", s.getLevel());
        m.put("slotNumber", s.getSlotNumber());
        m.put("vehicleType", s.getVehicleType().label());
        m.put("active", s.isActive());
        LocalDateTime from = Hours.minute(now);
        m.put("status", AvailabilityService.status(s, from, from.plusMinutes(1), now, null, held.get(s.getSlotId())));
        m.put("upcoming", upcoming);
        return m;
    }

    private Map<String, Object> slotJson(ParkingSlot s) {
        LocalDateTime now = now();
        LocalDateTime from = Hours.minute(now);
        return slotJson(s, now, availability.holding(s.getFacility(), from, from.plusMinutes(1)),
                reservations.countUpcomingAtSlot(s, now));
    }

    @Transactional(readOnly = true)
    public Map<String, Object> slots(String code, String level) {
        if (code == null || code.isBlank()) throw ApiException.badRequest("Choose a facility.");
        Facility f = facility(code);
        LocalDateTime now = now();
        LocalDateTime from = Hours.minute(now);
        Map<Long, List<Reservation>> held = availability.holding(f, from, from.plusMinutes(1));
        Map<Long, Long> upcoming = countMap(reservations.countUpcomingBySlot(f, now));
        List<ParkingSlot> list = level == null || level.isBlank() ? slots.findByFacility(f) : slots.findByFacilityAndLevel(f, level);
        return Map.of("slots", list.stream()
                .sorted(AvailabilityService.slotOrder())
                .map(s -> slotJson(s, now, held, upcoming.getOrDefault(s.getSlotId(), 0L)))
                .toList());
    }

    private void applySlot(ParkingSlot s, Map<String, Object> body, boolean create) {
        Map<String, String> fields = new LinkedHashMap<>();
        Facility f = s.getFacility();
        String level = s.getLevel();
        String number = s.getSlotNumber();
        if (create || Body.has(body, "level")) {
            String lv = Body.str(body, "level").toUpperCase().trim();
            if (!f.levelList().contains(lv)) fields.put("level", "Choose one of " + f.getName() + "'s levels.");
            else level = lv;
        }
        if (create || Body.has(body, "slotNumber")) {
            String n = Body.str(body, "slotNumber").toUpperCase().replaceAll("\\s+", "");
            if (!n.matches("[A-Z]{1,2}\\d{1,3}")) fields.put("slotNumber", "Row letter(s) then a number, e.g. A13.");
            else number = n;
        }
        VehicleType type = s.getVehicleType();
        if (create || Body.has(body, "vehicleType")) {
            Optional<VehicleType> v = VehicleType.fromLabel(Body.str(body, "vehicleType"));
            if (v.isEmpty()) fields.put("vehicleType", "Choose a vehicle type.");
            else type = v.get();
        }
        if (level != null && number != null && !fields.containsKey("level") && !fields.containsKey("slotNumber")) {
            Optional<ParkingSlot> clash = slots.findByFacilityAndLevelAndSlotNumber(f, level, number);
            if (clash.isPresent() && !clash.get().getSlotId().equals(s.getSlotId())) {
                fields.put("slotNumber", number + " already exists on level " + level + ".");
            }
        }
        if (!fields.isEmpty()) throw ApiException.fields(fields);
        s.setLevel(level);
        s.setSlotNumber(number);
        s.setVehicleType(type);
    }

    public Map<String, Object> createSlot(Map<String, Object> body) {
        Facility f = facilities.findByCode(Body.str(body, "facilityId"))
                .orElseThrow(() -> ApiException.fields(Map.of("facilityId", "Choose a facility.")));
        ParkingSlot s = new ParkingSlot();
        s.setFacility(f);
        s.setActive(true);
        applySlot(s, body, true);
        slots.save(s);
        return Map.of("slot", slotJson(s));
    }

    private ParkingSlot slot(Long id) {
        return slots.findById(id).orElseThrow(() -> ApiException.notFound("Slot not found."));
    }

    public Map<String, Object> updateSlot(Long id, Map<String, Object> body) {
        ParkingSlot s = slot(id);
        LocalDateTime now = now();
        List<Reservation> upcoming = reservations.findUpcomingAtSlot(s, now);
        if (Body.has(body, "active")) {
            boolean active = Boolean.parseBoolean(Body.str(body, "active"));
            if (!active && s.isActive() && !upcoming.isEmpty()) {
                throw ApiException.conflict(s.getSlotNumber() + " has " + upcoming.size()
                        + " upcoming reservation(s). Cancel them before taking it out of service.");
            }
        }
        if (Body.has(body, "vehicleType")) {
            Optional<VehicleType> v = VehicleType.fromLabel(Body.str(body, "vehicleType"));
            if (v.isPresent() && upcoming.stream().anyMatch(r -> !v.get().fits(r.getVehicleType()))) {
                throw ApiException.fields(HttpStatus.CONFLICT,
                        Map.of("vehicleType", "An upcoming reservation's vehicle wouldn't fit this bay type."));
            }
        }
        applySlot(s, body, false);
        if (Body.has(body, "active")) s.setActive(Boolean.parseBoolean(Body.str(body, "active")));
        return Map.of("slot", slotJson(s));
    }

    public Map<String, Object> deleteSlot(Long id) {
        ParkingSlot s = slot(id);
        long upcoming = reservations.countUpcomingAtSlot(s, now());
        if (upcoming > 0) {
            throw ApiException.conflict(s.getSlotNumber() + " has " + upcoming + " upcoming reservation(s). Cancel them first.");
        }
        slots.delete(s);
        return Map.of("ok", true);
    }

    // ---- reservations --------------------------------------------------------------

    @Transactional(readOnly = true)
    public Map<String, Object> reservations(String facilityCode, String status, String date) {
        LocalDateTime now = now();
        Facility f = facilityCode == null || facilityCode.isBlank() ? null : facility(facilityCode);
        Optional<LocalDate> day = Hours.parseDate(date);
        LocalDateTime from = day.map(LocalDate::atStartOfDay).orElse(LocalDateTime.of(2000, 1, 1, 0, 0));
        LocalDateTime to = day.map(d -> d.plusDays(1).atStartOfDay()).orElse(LocalDateTime.of(2100, 1, 1, 0, 0));
        List<Map<String, Object>> list = reservations.findForAdmin(f, from, to).stream()
                .map(r -> Views.admin(r, now))
                .filter(m -> {
                    if (status == null || status.isBlank()) return true;
                    if (status.equals("Upcoming")) {
                        Object state = m.get("state");
                        return "Confirmed".equals(m.get("status")) && !"Ended".equals(state) && !"Left".equals(state);
                    }
                    return status.equals(m.get("display")) || status.equals(m.get("status"));
                })
                .toList();
        // Newest first; cap the payload, the page says when it's showing a subset.
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("reservations", list.size() > LIST_LIMIT ? list.subList(0, LIST_LIMIT) : list);
        out.put("total", list.size());
        out.put("limit", LIST_LIMIT);
        return out;
    }

    public Map<String, Object> cancel(String serial) {
        LocalDateTime now = now();
        Reservation r;
        try {
            r = reservations.findById(Long.parseLong(serial)).orElseThrow(() -> ApiException.notFound("Reservation not found."));
        } catch (NumberFormatException e) {
            throw ApiException.notFound("Reservation not found.");
        }
        if (r.getStatus() != ReservationStatus.CONFIRMED || Views.ended(r, now)) {
            throw ApiException.conflict("Only upcoming or running reservations can be cancelled.");
        }
        if (r.getCheckedInAt() != null && r.getReleasedAt() == null) {
            throw ApiException.conflict("The car is parked. The attendant must release the slot first.");
        }
        r.setStatus(ReservationStatus.CANCELLED);
        return Map.of("reservation", Views.reservation(r, now));
    }

    // ---- occupancy & revenue ---------------------------------------------------------

    /** Occupancy right now + bookings and revenue over the last 30 days, per facility. */
    @Transactional(readOnly = true)
    public Map<String, Object> revenue() {
        LocalDateTime now = now();
        LocalDate today = now.toLocalDate();
        LocalDate since = today.minusDays(29);
        LocalDateTime from = Hours.minute(now);
        LocalDateTime to = from.plusMinutes(1);

        Map<Long, List<ParkingSlot>> bySlot = slots.findAllWithFacility().stream()
                .collect(Collectors.groupingBy(s -> s.getFacility().getFacilityId()));
        Map<Long, List<Reservation>> held = availability.holding(null, from, to);
        Map<Long, List<Reservation>> byFacility = reservations.findForRevenue(since.atStartOfDay(), now).stream()
                .collect(Collectors.groupingBy(r -> r.getFacility().getFacilityId()));

        List<Map<String, Object>> rows = new ArrayList<>();
        long[] t = new long[6]; // slots, occupied, reserved, reservations, revenue, pending
        for (Facility f : facilities.findAllByOrderByFacilityIdAsc()) {
            Map<String, Integer> c = AvailabilityService.counts(
                    bySlot.getOrDefault(f.getFacilityId(), List.of()), from, to, now, held);
            int inService = c.get(AvailabilityService.AVAILABLE) + c.get(AvailabilityService.RESERVED) + c.get(AvailabilityService.OCCUPIED);
            List<Reservation> rs = byFacility.getOrDefault(f.getFacilityId(), List.of());
            List<Reservation> recent = rs.stream().filter(r -> {
                LocalDate d = r.getStartTime().toLocalDate();
                return !d.isBefore(since) && !d.isAfter(today);
            }).toList();
            long bookings = recent.stream().filter(r -> r.getStatus() != ReservationStatus.CANCELLED).count();
            long revenue = recent.stream().filter(r -> r.getPayment().getStatus() == PaymentStatus.PAID).mapToLong(Reservation::getAmount).sum();
            long pending = rs.stream()
                    .filter(r -> r.getStatus() == ReservationStatus.CONFIRMED && !Views.paid(r) && !Views.ended(r, now))
                    .mapToLong(Reservation::getAmount).sum();
            int occupied = c.get(AvailabilityService.OCCUPIED);
            int reserved = c.get(AvailabilityService.RESERVED);

            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", f.getCode());
            m.put("name", f.getName());
            m.put("active", f.isActive());
            m.put("slots", inService);
            m.put("occupied", occupied);
            m.put("reserved", reserved);
            m.put("occupancy", inService == 0 ? 0 : Math.round((occupied + reserved) * 100.0 / inService));
            m.put("reservations", bookings);
            m.put("revenue", revenue);
            m.put("pending", pending);
            m.put("sampleTraffic", false);
            rows.add(m);
            t[0] += inService;
            t[1] += occupied;
            t[2] += reserved;
            t[3] += bookings;
            t[4] += revenue;
            t[5] += pending;
        }
        Map<String, Object> total = new LinkedHashMap<>();
        total.put("slots", t[0]);
        total.put("occupied", t[1]);
        total.put("reserved", t[2]);
        total.put("reservations", t[3]);
        total.put("revenue", t[4]);
        total.put("pending", t[5]);
        total.put("occupancy", t[0] == 0 ? 0 : Math.round((t[1] + t[2]) * 100.0 / t[0]));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("asOf", Hours.hm(now));
        out.put("since", since.toString());
        out.put("until", today.toString());
        out.put("rows", rows);
        out.put("total", total);
        return out;
    }
}

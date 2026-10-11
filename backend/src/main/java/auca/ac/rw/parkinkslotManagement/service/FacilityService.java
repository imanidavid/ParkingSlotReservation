package auca.ac.rw.parkinkslotManagement.service;

import auca.ac.rw.parkinkslotManagement.model.Facility;
import auca.ac.rw.parkinkslotManagement.model.ParkingSlot;
import auca.ac.rw.parkinkslotManagement.model.Reservation;
import auca.ac.rw.parkinkslotManagement.model.User;
import auca.ac.rw.parkinkslotManagement.model.VehicleType;
import auca.ac.rw.parkinkslotManagement.repository.FacilityRepository;
import auca.ac.rw.parkinkslotManagement.repository.ParkingSlotRepository;
import auca.ac.rw.parkinkslotManagement.repository.UserRepository;
import auca.ac.rw.parkinkslotManagement.web.ApiException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Driver-facing reads: facility list, one facility's lot, the home page. */
@Service
@Transactional(readOnly = true)
public class FacilityService {

    private final FacilityRepository facilities;
    private final ParkingSlotRepository slots;
    private final UserRepository users;
    private final AvailabilityService availability;
    private final ReservationService reservations;
    private final Clock clock;

    public FacilityService(
            FacilityRepository facilities, ParkingSlotRepository slots, UserRepository users,
            AvailabilityService availability, ReservationService reservations, Clock clock) {
        this.facilities = facilities;
        this.slots = slots;
        this.users = users;
        this.availability = availability;
        this.reservations = reservations;
        this.clock = clock;
    }

    private static Map<String, String> windowJson(Optional<Hours.Window> w) {
        return w.map(x -> Map.of("start", Hours.hm(x.start()), "end", Hours.hm(x.end()))).orElse(null);
    }

    public Map<String, Object> list(String dateParam, String durationParam) {
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDate today = now.toLocalDate();
        LocalDate day = Hours.parseDate(dateParam).filter(d -> !d.isBefore(today)).orElse(today);
        Hours.Duration dur = Hours.duration(durationParam).orElse(Hours.DURATIONS.get(0));
        Optional<Hours.Window> win = Hours.defaultWindow(day, dur, now);

        Map<Long, List<ParkingSlot>> byFacility = slots.findAllInActiveFacilities().stream()
                .collect(Collectors.groupingBy(s -> s.getFacility().getFacilityId()));
        Map<Long, List<Reservation>> held = win.isPresent()
                ? availability.holding(null, win.get().start(), win.get().end())
                : Map.of();

        List<Map<String, Object>> list = new ArrayList<>();
        for (Facility f : facilities.findByActiveTrueOrderByFacilityIdAsc()) {
            List<ParkingSlot> fs = byFacility.getOrDefault(f.getFacilityId(), List.of());
            int available = win.map(w -> AvailabilityService.counts(fs, w.start(), w.end(), now, held)
                    .get(AvailabilityService.AVAILABLE)).orElse(0);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", f.getCode());
            m.put("name", f.getName());
            m.put("address", f.getAddress());
            m.put("city", f.getCity());
            m.put("type", f.getType());
            m.put("vehicles", AvailabilityService.vehiclesFor(fs));
            m.put("totalSlots", fs.stream().filter(ParkingSlot::isActive).count());
            m.put("available", available);
            m.put("rateFrom", f.getRate());
            m.put("sampleTraffic", false);
            list.add(m);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("today", today.toString());
        out.put("date", day.toString());
        out.put("duration", dur.id());
        out.put("window", windowJson(win));
        out.put("facilities", list);
        out.put("facilityTypes", Facility.TYPES);
        out.put("vehicleTypes", VehicleType.labels());
        return out;
    }

    public Map<String, Object> detail(String code, Map<String, String> q) {
        Facility f = facilities.findByCode(code).filter(Facility::isActive)
                .orElseThrow(() -> ApiException.notFound("Facility not found."));
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDate today = now.toLocalDate();
        LocalDate maxDate = today.plusDays(Hours.HORIZON_DAYS);
        LocalDate date = Hours.parseDate(q.get("date"))
                .filter(d -> !d.isBefore(today) && !d.isAfter(maxDate)).orElse(today);
        Hours.Duration dur = Hours.duration(q.get("duration")).orElse(Hours.DURATIONS.get(0));
        List<String> levels = f.levelList();
        String level = levels.contains(q.get("level")) ? q.get("level") : levels.isEmpty() ? null : levels.get(0);
        VehicleType vehicle = VehicleType.fromLabel(q.get("vehicle")).orElse(null);
        List<String> starts = Hours.startTimes(date, dur, now);
        String start = starts.contains(q.get("start")) ? q.get("start") : starts.isEmpty() ? null : starts.get(0);
        Optional<Hours.Window> win = start == null ? Optional.empty() : Optional.of(Hours.window(date, start, dur));

        List<ParkingSlot> all = slots.findByFacility(f);
        AvailabilityService.Grid grid = new AvailabilityService.Grid(1, List.of());
        if (win.isPresent() && level != null) {
            String lv = level;
            List<ParkingSlot> levelSlots = all.stream().filter(s -> s.getLevel().equals(lv)).toList();
            grid = availability.grid(levelSlots, win.get().start(), win.get().end(), now,
                    availability.holding(f, win.get().start(), win.get().end()), vehicle);
        }

        Map<String, Object> facility = new LinkedHashMap<>();
        facility.put("id", f.getCode());
        facility.put("name", f.getName());
        facility.put("address", f.getAddress());
        facility.put("city", f.getCity());
        facility.put("type", f.getType());
        facility.put("vehicles", AvailabilityService.vehiclesFor(all));
        facility.put("rate", f.getRate());
        facility.put("levels", levels);
        facility.put("sampleTraffic", false);

        List<Map<String, Object>> durations = Hours.DURATIONS.stream()
                .map(d -> Map.<String, Object>of("id", d.id(), "label", d.label(), "price", Hours.price(f.getRate(), d)))
                .toList();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("facility", facility);
        out.put("level", level);
        out.put("date", date.toString());
        out.put("minDate", today.toString());
        out.put("maxDate", maxDate.toString());
        out.put("duration", dur.id());
        out.put("vehicle", vehicle == null ? null : vehicle.label());
        out.put("vehicleTypes", VehicleType.labels());
        out.put("durations", durations);
        out.put("start", start);
        out.put("startTimes", starts);
        out.put("window", windowJson(win));
        out.put("cols", grid.cols());
        out.put("rows", grid.rows());
        return out;
    }

    public Map<String, Object> home(Long userId) {
        User user = users.findById(userId).orElseThrow();
        Map<String, Object> mine = reservations.listFor(userId);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> upcoming = (List<Map<String, Object>>) mine.get("upcoming");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> past = (List<Map<String, Object>>) mine.get("past");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> all = (List<Map<String, Object>>) list(null, null).get("facilities");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("user", Map.of("email", user.getEmail(), "role", user.getRole().json()));
        out.put("upcoming", upcoming.isEmpty() ? null : upcoming.get(0));
        out.put("facilities", all.stream()
                .sorted(Comparator.comparingInt((Map<String, Object> m) -> (Integer) m.get("available")).reversed())
                .limit(5).toList());
        out.put("facilityCount", all.size());
        out.put("past", past.stream().limit(5).toList());
        return out;
    }
}

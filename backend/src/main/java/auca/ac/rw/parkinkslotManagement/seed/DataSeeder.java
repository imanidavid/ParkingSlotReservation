package auca.ac.rw.parkinkslotManagement.seed;

import auca.ac.rw.parkinkslotManagement.model.Facility;
import auca.ac.rw.parkinkslotManagement.model.ParkingSlot;
import auca.ac.rw.parkinkslotManagement.model.Payment;
import auca.ac.rw.parkinkslotManagement.model.PaymentMethod;
import auca.ac.rw.parkinkslotManagement.model.PaymentStatus;
import auca.ac.rw.parkinkslotManagement.model.Reservation;
import auca.ac.rw.parkinkslotManagement.model.ReservationStatus;
import auca.ac.rw.parkinkslotManagement.model.Role;
import auca.ac.rw.parkinkslotManagement.model.User;
import auca.ac.rw.parkinkslotManagement.model.VehicleType;
import auca.ac.rw.parkinkslotManagement.repository.FacilityRepository;
import auca.ac.rw.parkinkslotManagement.service.Hours;
import auca.ac.rw.parkinkslotManagement.service.PasswordHasher;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Demo data, written once into an empty database: 24 Kigali facilities with
 * their slots, the demo accounts, the demo driver's history, today's bookings
 * for the attendant demo, and walk-in bookings so lots and revenue aren't empty.
 * Everything is real rows; nothing is invented at read time. Called by StartupData.
 */
@Component
public class DataSeeder {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);
    public static final String DEMO_PASSWORD = "karita123";

    private static final List<VehicleType> ALL = List.of(VehicleType.MOTORCYCLE, VehicleType.CAR, VehicleType.SUV, VehicleType.TRUCK);
    private static final List<VehicleType> NO_TRUCK = List.of(VehicleType.MOTORCYCLE, VehicleType.CAR, VehicleType.SUV);
    private static final List<VehicleType> CARS = List.of(VehicleType.CAR, VehicleType.SUV);

    record Lvl(String name, int rows, int cols) {}

    /** busy: how full the walk-in traffic makes it (0–1). */
    record Seed(String code, String name, String address, String type, List<VehicleType> allow, List<Lvl> levels, int rate, double busy) {}

    private static Lvl lvl(String name) {
        return new Lvl(name, 4, 12);
    }

    private static Lvl lvl(String name, int rows) {
        return new Lvl(name, rows, 12);
    }

    static final List<Seed> FACILITIES = List.of(
            new Seed("kigali-heights", "Kigali Heights", "KG 7 Ave, Kimihurura", "Mall", NO_TRUCK, List.of(lvl("B1"), lvl("B2")), 500, 0.55),
            new Seed("kcc", "Kigali Convention Centre", "KG 2 Roundabout, Kimihurura", "Public", ALL, List.of(lvl("P1"), lvl("P2"), lvl("P3")), 500, 0.4),
            new Seed("kigali-city-tower", "Kigali City Tower", "KN 81 St, Nyarugenge", "Mall", CARS, List.of(lvl("P1"), lvl("P2")), 600, 0.8),
            new Seed("kbc", "Kigali Business Centre", "KG 9 Ave, Kacyiru", "Office", NO_TRUCK, List.of(lvl("B1")), 400, 0.6),
            new Seed("chic", "CHIC Complex", "KN 2 St, Nyarugenge", "Mall", NO_TRUCK, List.of(lvl("B1"), lvl("B2")), 300, 0.75),
            new Seed("utc", "Union Trade Centre", "KN 4 Ave, Nyarugenge", "Mall", NO_TRUCK, List.of(lvl("B1", 3)), 400, 0.65),
            new Seed("m-peace-plaza", "M Peace Plaza", "KN 4 Ave, Nyarugenge", "Mall", NO_TRUCK, List.of(lvl("B1"), lvl("B2", 3)), 400, 0.5),
            new Seed("grand-pension-plaza", "Grand Pension Plaza", "KN 3 Rd, Nyarugenge", "Office", CARS, List.of(lvl("B1")), 500, 0.45),
            new Seed("mtn-centre", "MTN Centre", "KG 9 Ave, Nyarutarama", "Office", NO_TRUCK, List.of(lvl("G", 3)), 400, 0.35),
            new Seed("norrsken-house", "Norrsken House Kigali", "KN 78 St, Nyarugenge", "Office", List.of(VehicleType.MOTORCYCLE, VehicleType.CAR), List.of(lvl("G", 2)), 300, 0.5),
            new Seed("bk-arena", "BK Arena", "KG 17 Ave, Remera", "Public", ALL, List.of(lvl("P1"), lvl("P2")), 300, 0.25),
            new Seed("amahoro-stadium", "Amahoro Stadium", "KG 17 Ave, Remera", "Public", ALL, List.of(lvl("P1"), lvl("P2"), lvl("P3")), 300, 0.2),
            new Seed("remera-taxi-park", "Remera Taxi Park", "KG 11 Ave, Remera", "Public", ALL, List.of(lvl("G")), 200, 0.6),
            new Seed("nyabugogo-bus-park", "Nyabugogo Bus Park", "KN 1 Rd, Nyabugogo", "Public", ALL, List.of(lvl("G"), lvl("P1")), 200, 0.7),
            new Seed("kimironko-market", "Kimironko Market", "KG 11 Ave, Kimironko", "Public", ALL, List.of(lvl("G", 3)), 200, 0.65),
            new Seed("kicukiro-centre", "Kicukiro Centre", "KK 15 Rd, Kicukiro", "Public", NO_TRUCK, List.of(lvl("G", 2)), 200, 0.4),
            new Seed("nyamirambo-stadium", "Nyamirambo Regional Stadium", "KN 2 Ave, Nyamirambo", "Public", ALL, List.of(lvl("G")), 200, 0.15),
            new Seed("ur-nyarugenge", "University of Rwanda, Nyarugenge Campus", "KN 7 Rd, Nyarugenge", "Campus", NO_TRUCK, List.of(lvl("G"), lvl("P1", 3)), 200, 0.5),
            new Seed("ur-gikondo", "University of Rwanda, Gikondo Campus", "KK 737 St, Gikondo", "Campus", NO_TRUCK, List.of(lvl("G", 3)), 200, 0.45),
            new Seed("auca", "Adventist University of Central Africa", "KG 6 Ave, Gishushu", "Campus", NO_TRUCK, List.of(lvl("G", 2)), 200, 0.3),
            new Seed("mku-kigali", "Mount Kenya University Kigali", "KK 737 St, Kicukiro", "Campus", NO_TRUCK, List.of(lvl("G", 2)), 200, 0.35),
            new Seed("cmu-africa", "Carnegie Mellon University Africa", "Kigali Innovation City, Bumbogo", "Campus", NO_TRUCK, List.of(lvl("G", 3)), 300, 0.2),
            new Seed("kigali-innovation-city", "Kigali Innovation City", "Bumbogo, Gasabo", "Campus", ALL, List.of(lvl("G")), 300, 0.1),
            new Seed("kigali-public-library", "Kigali Public Library", "KG 7 Ave, Kacyiru", "Public", NO_TRUCK, List.of(lvl("G", 2)), 200, 0.3));

    private final FacilityRepository facilities;
    private final EntityManager em;
    private final TransactionTemplate tx;
    private final PasswordHasher hasher;
    private final Clock clock;
    private final boolean enabled;

    private final Map<String, ParkingSlot> slotIndex = new HashMap<>();
    /** slotId|date -> booked [start, end) pairs, so seeded bookings never overlap. */
    private final Map<String, List<LocalDateTime[]>> booked = new HashMap<>();
    private int pending;

    public DataSeeder(
            FacilityRepository facilities, EntityManager em, TransactionTemplate tx, PasswordHasher hasher,
            Clock clock, @Value("${karita.seed:true}") boolean enabled) {
        this.facilities = facilities;
        this.em = em;
        this.tx = tx;
        this.hasher = hasher;
        this.clock = clock;
        this.enabled = enabled;
    }

    public void seedIfEmpty() {
        if (!enabled || facilities.count() > 0) return;
        long t0 = System.currentTimeMillis();
        tx.executeWithoutResult(s -> seed());
        log.info("Seeded demo data in {} ms", System.currentTimeMillis() - t0);
    }

    // Seeded bay mix: trucks at the front of row A, motorcycles at the end of
    // the last row, SUVs at the row ends, cars everywhere else.
    static VehicleType bayType(List<VehicleType> allow, int row, int rows, int col, int cols) {
        if (allow.contains(VehicleType.TRUCK) && row == 0 && col <= 2) return VehicleType.TRUCK;
        if (allow.contains(VehicleType.MOTORCYCLE) && row == rows - 1 && col > cols - 4) return VehicleType.MOTORCYCLE;
        if (allow.contains(VehicleType.SUV) && col > cols - 2) return VehicleType.SUV;
        return VehicleType.CAR;
    }

    private void seed() {
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDate today = now.toLocalDate();
        Map<String, Facility> byCode = new HashMap<>();
        Map<String, Double> busy = new HashMap<>();

        for (Seed sd : FACILITIES) {
            Facility f = new Facility();
            f.setCode(sd.code());
            f.setName(sd.name());
            f.setAddress(sd.address());
            f.setCity("Kigali");
            f.setType(sd.type());
            f.setRate(sd.rate());
            f.setLevelList(sd.levels().stream().map(Lvl::name).toList());
            f.setActive(true);
            em.persist(f);
            byCode.put(sd.code(), f);
            busy.put(sd.code(), sd.busy());
            for (Lvl l : sd.levels()) {
                for (int r = 0; r < l.rows(); r++) {
                    for (int c = 1; c <= l.cols(); c++) {
                        String number = (char) ('A' + r) + String.valueOf(c);
                        ParkingSlot s = new ParkingSlot(f, l.name(), number, bayType(sd.allow(), r, l.rows(), c, l.cols()));
                        em.persist(s);
                        slotIndex.put(sd.code() + "|" + l.name() + "|" + number, s);
                    }
                }
            }
        }

        User driver = user("Demo Driver", "driver@karita.rw", Role.USER, "RAD 482 C", VehicleType.CAR, null, DEMO_PASSWORD);
        user("Demo Attendant", "attendant@karita.rw", Role.ATTENDANT, null, null, byCode.get("kigali-heights"), DEMO_PASSWORD);
        user("Demo Admin", "admin@karita.rw", Role.ADMIN, null, null, null, DEMO_PASSWORD);
        User driver2 = user("Second Driver", "driver2@karita.rw", Role.USER, "RAC 117 B", VehicleType.SUV, null, DEMO_PASSWORD);
        User walkIn = user("Walk-in bookings", "walkin@karita.rw", Role.USER, "RAA 000 A", VehicleType.CAR, null,
                UUID.randomUUID().toString());
        em.flush();

        // The demo driver's history (oldest first) and tomorrow's booking.
        book(driver, slot("chic", "B2", "D1"), today.minusDays(28).atTime(9, 0), 4, ReservationStatus.CONFIRMED, PaymentStatus.PAID, PaymentMethod.MOBILE_MONEY, true);
        book(driver, slot("kbc", "B1", "A3"), today.minusDays(23).atTime(13, 0), 2, ReservationStatus.CONFIRMED, PaymentStatus.PAID, PaymentMethod.CASH, true);
        book(driver, slot("kigali-city-tower", "P2", "C2"), today.minusDays(19).atTime(10, 0), 2, ReservationStatus.CANCELLED, PaymentStatus.FAILED, PaymentMethod.CARD, false);
        book(driver, slot("kigali-heights", "B1", "A1"), today.minusDays(14).atTime(8, 0), 4, ReservationStatus.CONFIRMED, PaymentStatus.PAID, PaymentMethod.MOBILE_MONEY, true);
        book(driver, slot("kcc", "P1", "B4"), today.minusDays(9).atTime(14, 0), 2, ReservationStatus.CONFIRMED, PaymentStatus.PAID, PaymentMethod.CARD, true);
        book(driver, slot("kigali-heights", "B1", "A1"), today.plusDays(1).atTime(8, 0), 4, ReservationStatus.CONFIRMED, PaymentStatus.PENDING, null, false);

        // Today at Kigali Heights for the attendant demo: one paid and running now, one cash later.
        int startHour = Math.min(Math.max(now.getHour(), 6), 19);
        book(driver, slot("kigali-heights", "B1", "B3"), today.atTime(startHour, 0), 3, ReservationStatus.CONFIRMED, PaymentStatus.PAID, PaymentMethod.MOBILE_MONEY, false);
        int later = Math.min(startHour + 1, 20);
        book(driver2, slot("kigali-heights", "B2", "C11"), today.atTime(later, 0), 2, ReservationStatus.CONFIRMED, PaymentStatus.PENDING, PaymentMethod.CASH, false);

        walkIns(walkIn, byCode, busy, now);
    }

    private User user(String name, String email, Role role, String plate, VehicleType vehicle, Facility facility, String password) {
        User u = new User();
        u.setFullName(name);
        u.setEmail(email);
        u.setRole(role);
        u.setPlate(plate);
        u.setVehicleType(vehicle);
        u.setAssignedFacility(facility);
        u.setPasswordHash(hasher.hash(password));
        em.persist(u);
        return u;
    }

    private ParkingSlot slot(String code, String level, String number) {
        return slotIndex.get(code + "|" + level + "|" + number);
    }

    private boolean free(ParkingSlot s, LocalDateTime start, LocalDateTime end) {
        List<LocalDateTime[]> list = booked.get(s.getSlotId() + "|" + start.toLocalDate());
        if (list == null) return true;
        for (LocalDateTime[] b : list) if (b[0].isBefore(end) && start.isBefore(b[1])) return false;
        return true;
    }

    private void book(
            User u, ParkingSlot s, LocalDateTime start, int hours, ReservationStatus status,
            PaymentStatus payStatus, PaymentMethod method, boolean checkedIn) {
        book(u, s, start, start.plusHours(hours), u.getPlate(), u.getVehicleType(), status, payStatus, method, checkedIn);
    }

    private void book(
            User u, ParkingSlot s, LocalDateTime start, LocalDateTime end, String plate, VehicleType vehicle,
            ReservationStatus status, PaymentStatus payStatus, PaymentMethod method, boolean checkedIn) {
        Facility f = s.getFacility();
        Reservation r = new Reservation();
        r.setUser(u);
        r.setFacility(f);
        r.setSlot(s);
        r.setSlotLevel(s.getLevel());
        r.setSlotNumber(s.getSlotNumber());
        r.setVehiclePlate(plate);
        r.setVehicleType(vehicle);
        r.setStartTime(start);
        r.setEndTime(end);
        r.setHoldUntil(end);
        r.setStatus(status);
        r.setAmount(Hours.priceForMinutes(f.getRate(), ChronoUnit.MINUTES.between(start, end)));
        r.setCreatedAt(start.minusDays(1).atZone(clock.getZone()).toInstant());
        if (checkedIn) r.setCheckedInAt(start.plusMinutes(5).atZone(clock.getZone()).toInstant());
        Payment p = new Payment();
        p.setAmount(r.getAmount());
        p.setStatus(payStatus);
        p.setMethod(method);
        if (method == PaymentMethod.MOBILE_MONEY) p.setDetail("+250 ••• ••• " + (100 + Math.abs(plate.hashCode()) % 900));
        if (method == PaymentMethod.CARD) p.setDetail("•••• " + (1000 + Math.abs(plate.hashCode()) % 9000));
        if (method == PaymentMethod.CASH) p.setDetail(payStatus == PaymentStatus.PAID ? "Collected at entry" : "Pay at entry");
        if (payStatus == PaymentStatus.PAID) p.setPaidAt(start.minusHours(1).atZone(clock.getZone()).toInstant());
        r.attachPayment(p);
        em.persist(r);
        booked.computeIfAbsent(s.getSlotId() + "|" + start.toLocalDate(), k -> new ArrayList<>())
                .add(new LocalDateTime[] {start, end});
        if (++pending % 400 == 0) {
            em.flush();
            em.clear();
        }
    }

    /** Fixed-seed walk-in traffic: two weeks back, today, one week ahead. */
    private void walkIns(User walkIn, Map<String, Facility> byCode, Map<String, Double> busy, LocalDateTime now) {
        Random rnd = new Random(27896);
        LocalDate today = now.toLocalDate();
        String letters = "ABCDEFGHJKLMNPRSTUVWXYZ";
        PaymentMethod[] methods = {PaymentMethod.MOBILE_MONEY, PaymentMethod.MOBILE_MONEY, PaymentMethod.MOBILE_MONEY, PaymentMethod.CARD, PaymentMethod.CASH};
        List<ParkingSlot> all = new ArrayList<>(slotIndex.values());
        all.sort((a, b) -> Long.compare(a.getSlotId(), b.getSlotId()));

        for (int d = -14; d <= 7; d++) {
            LocalDate day = today.plusDays(d);
            for (ParkingSlot s : all) {
                double p = busy.get(s.getFacility().getCode()) * 0.55;
                for (int k = 0; k < 2; k++) {
                    if (rnd.nextDouble() >= p) continue;
                    int startHour = 6 + rnd.nextInt(13);
                    int hours = 2 + rnd.nextInt(4);
                    LocalDateTime start = day.atTime(startHour, 0);
                    LocalDateTime end = day.atTime(Math.min(startHour + hours, 22), 0);
                    if (!end.isAfter(start) || !free(s, start, end)) continue;

                    String plate = "R" + letters.charAt(rnd.nextInt(letters.length())) + letters.charAt(rnd.nextInt(letters.length()))
                            + " " + (100 + rnd.nextInt(900)) + " " + letters.charAt(rnd.nextInt(letters.length()));
                    PaymentMethod method = methods[rnd.nextInt(methods.length)];
                    double roll = rnd.nextDouble();
                    boolean past = !end.isAfter(now);
                    boolean running = !start.isAfter(now) && end.isAfter(now);

                    ReservationStatus status = ReservationStatus.CONFIRMED;
                    PaymentStatus pay;
                    boolean checkedIn = false;
                    if (past) {
                        if (roll < 0.05) status = ReservationStatus.CANCELLED;
                        else if (roll < 0.09) status = ReservationStatus.NO_SHOW;
                        pay = status == ReservationStatus.CONFIRMED ? PaymentStatus.PAID : PaymentStatus.PENDING;
                        checkedIn = status == ReservationStatus.CONFIRMED;
                    } else if (running) {
                        pay = PaymentStatus.PAID;
                        checkedIn = roll < 0.9;
                    } else {
                        pay = roll < 0.7 ? PaymentStatus.PAID : PaymentStatus.PENDING;
                        if (pay == PaymentStatus.PENDING) method = PaymentMethod.CASH;
                    }
                    book(walkIn, s, start, end, plate,
                            s.getVehicleType(), status, pay, method, checkedIn);
                }
            }
        }
    }
}

package auca.ac.rw.parkinkslotManagement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import auca.ac.rw.parkinkslotManagement.model.Payment;
import auca.ac.rw.parkinkslotManagement.model.Reservation;
import auca.ac.rw.parkinkslotManagement.repository.ReservationRepository;
import com.jayway.jsonpath.JsonPath;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * End-to-end API tests against PostgreSQL (database karita_test, rebuilt and
 * reseeded for this run). "Now" is pinned to 10:00 Kigali time today.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("smoke")
@TestMethodOrder(MethodOrderer.MethodName.class)
class ApiIntegrationTest {

    static final ZoneId KIGALI = ZoneId.of("Africa/Kigali");
    static final LocalDate TODAY = LocalDate.now(KIGALI);
    static final MutableClock CLOCK = new MutableClock(TODAY.atTime(10, 0).atZone(KIGALI).toInstant(), KIGALI);

    /** With no client registration configured, the page must show no button. */
    @Test
    void a0_providersIsEmptyWhenOAuthIsNotConfigured() throws Exception {
        mvc.perform(get("/api/auth/providers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.providers").isArray())
                .andExpect(jsonPath("$.providers").isEmpty());
    }

    @TestConfiguration
    static class FixedClock {
        @Bean
        @Primary
        Clock testClock() {
            return CLOCK;
        }
    }

    @Autowired
    MockMvc mvc;

    @Autowired
    ReservationRepository reservations;

    // ---- helpers ---------------------------------------------------------------

    static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder b, String body) {
        return b.contentType(MediaType.APPLICATION_JSON).content(body);
    }

    MockHttpSession login(String email) throws Exception {
        MvcResult r = mvc.perform(json(post("/api/auth/login"),
                        "{\"email\":\"" + email + "\",\"password\":\"karita123\"}"))
                .andExpect(status().isOk())
                .andReturn();
        return (MockHttpSession) r.getRequest().getSession(false);
    }

    String body(MvcResult r) throws Exception {
        return r.getResponse().getContentAsString();
    }

    /** First bookable slot (status Available, fits a car) for a window. */
    String freeSlot(MockHttpSession s, String facility, String date, String start, String duration) throws Exception {
        String json = body(mvc.perform(get("/api/facilities/" + facility)
                        .param("date", date).param("start", start).param("duration", duration).param("vehicle", "Car")
                        .session(s))
                .andExpect(status().isOk()).andReturn());
        List<String> ids = JsonPath.read(json, "$.rows[*].slots[?(@.status == 'Available' && @.vehicleType == 'Car')].id");
        String level = JsonPath.read(json, "$.level");
        return level + "|" + ids.get(0);
    }

    String reserveBody(String facility, String levelAndSlot, String date, String start, String duration, String plate, String vehicle) {
        String[] ls = levelAndSlot.split("\\|");
        return "{\"facilityId\":\"" + facility + "\",\"level\":\"" + ls[0] + "\",\"slot\":\"" + ls[1]
                + "\",\"date\":\"" + date + "\",\"start\":\"" + start + "\",\"duration\":\"" + duration
                + "\",\"plate\":\"" + plate + "\",\"vehicle\":\"" + vehicle + "\"}";
    }

    String reserve(MockHttpSession s, String facility, String date, String start) throws Exception {
        String slot = freeSlot(s, facility, date, start, "2h");
        MvcResult r = mvc.perform(json(post("/api/reservations"), reserveBody(facility, slot, date, start, "2h", "RAD 482 C", "Car"))
                        .session(s))
                .andExpect(status().isCreated()).andReturn();
        return JsonPath.read(body(r), "$.reservation.serial");
    }

    // ---- auth, sessions, roles -------------------------------------------------------

    @Test
    void a01_signedOutApiIs401Json() throws Exception {
        mvc.perform(get("/api/home"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Not signed in."));
    }

    @Test
    void a02_pageGuardRedirectsWithNextAndExpiredReason() throws Exception {
        mvc.perform(get("/reservations.html"))
                .andExpect(status().is3xxRedirection())
                .andExpect(header().string("Location", "/login.html?next=reservations.html"));
        mvc.perform(get("/home.html").with(req -> {
                    req.setRequestedSessionId("gone");
                    req.setRequestedSessionIdValid(false);
                    return req;
                }))
                .andExpect(header().string("Location", "/login.html?reason=expired&next=home.html"));
        MockHttpSession driver = login("driver@karita.rw");
        mvc.perform(get("/login.html").session(driver)).andExpect(header().string("Location", "/home.html"));
        mvc.perform(get("/admin.html").session(driver)).andExpect(header().string("Location", "/home.html"));
    }

    @Test
    void a03_rolesAreEnforcedOnTheApi() throws Exception {
        MockHttpSession driver = login("driver@karita.rw");
        MockHttpSession attendant = login("attendant@karita.rw");
        mvc.perform(get("/api/admin/revenue").session(driver)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Admin accounts only."));
        mvc.perform(get("/api/home").session(attendant)).andExpect(status().isForbidden());
        mvc.perform(get("/api/attendant/board").session(driver)).andExpect(status().isForbidden());
        mvc.perform(get("/api/auth/me").session(attendant))
                .andExpect(jsonPath("$.role").value("attendant"))
                .andExpect(jsonPath("$.facility").value("Kigali Heights"));
    }

    @Test
    void a04_registerValidatesAndRejectsDuplicates() throws Exception {
        mvc.perform(json(post("/api/auth/register"), "{\"fullName\":\"A\",\"email\":\"x\",\"password\":\"short\",\"plate\":\"?\",\"vehicle\":\"Bus\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.fullName").exists())
                .andExpect(jsonPath("$.fields.email").exists())
                .andExpect(jsonPath("$.fields.password").exists())
                .andExpect(jsonPath("$.fields.plate").exists())
                .andExpect(jsonPath("$.fields.vehicle").exists());
        mvc.perform(json(post("/api/auth/register"),
                        "{\"fullName\":\"Test Person\",\"email\":\"DRIVER@karita.rw\",\"password\":\"parking123\",\"plate\":\"RAE 101 D\",\"vehicle\":\"Car\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.fields.email").value("This email is already registered. Sign in instead."));
        mvc.perform(json(post("/api/auth/register"),
                        "{\"fullName\":\"Test Person\",\"email\":\"test.person@karita.rw\",\"password\":\"parking123\",\"plate\":\"rae 101 d\",\"vehicle\":\"Motorcycle\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.redirect").value("home.html"));
    }

    @Test
    void a05_loginIsThrottledAfterTenFailures() throws Exception {
        for (int i = 0; i < 10; i++) {
            mvc.perform(json(post("/api/auth/login"), "{\"email\":\"nobody@karita.rw\",\"password\":\"x\"}"))
                    .andExpect(status().isUnauthorized());
        }
        mvc.perform(json(post("/api/auth/login"), "{\"email\":\"nobody@karita.rw\",\"password\":\"x\"}"))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void a06_errorsAlwaysHaveTheSameShape() throws Exception {
        MockHttpSession driver = login("driver@karita.rw");
        mvc.perform(json(post("/api/reservations"), "{bad").session(driver))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("Invalid request."));
        mvc.perform(get("/api/nope").session(driver))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error").value("Not found."));
        mvc.perform(json(post("/api/reservations"), "{}").session(driver).header("Origin", "http://evil.example"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Cross-site requests are not allowed."));
        mvc.perform(delete("/api/reservations").session(driver))
                .andExpect(status().isMethodNotAllowed());
    }

    // ---- reserve, double booking -------------------------------------------------------

    @Test
    void b01_reserveValidatesPlateAndVehicleFit() throws Exception {
        MockHttpSession driver = login("driver@karita.rw");
        String date = TODAY.plusDays(2).toString();
        String slot = freeSlot(driver, "bk-arena", date, "10:00", "2h");
        mvc.perform(json(post("/api/reservations"), reserveBody("bk-arena", slot, date, "10:00", "2h", "", "Car")).session(driver))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("plate"));
        mvc.perform(json(post("/api/reservations"), reserveBody("bk-arena", slot, date, "10:00", "2h", "RAD 482 C", "Truck")).session(driver))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("vehicle"));
        mvc.perform(json(post("/api/reservations"), reserveBody("bk-arena", slot, date, "05:00", "2h", "RAD 482 C", "Car")).session(driver))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("start"));
    }

    @Test
    void b02_concurrentBookingsOfOneSlotYieldOneWinner() throws Exception {
        MockHttpSession d1 = login("driver@karita.rw");
        MockHttpSession d2 = login("driver2@karita.rw");
        String date = TODAY.plusDays(3).toString();
        String slot = freeSlot(d1, "amahoro-stadium", date, "11:00", "2h");
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Future<Integer>> results = new ArrayList<>();
        for (MockHttpSession s : List.of(d1, d2)) {
            results.add(pool.submit(() -> {
                go.await();
                return mvc.perform(json(post("/api/reservations"),
                                reserveBody("amahoro-stadium", slot, date, "11:00", "2h", "RAD 482 C", "Car")).session(s))
                        .andReturn().getResponse().getStatus();
            }));
        }
        go.countDown();
        List<Integer> statuses = new ArrayList<>();
        for (Future<Integer> f : results) statuses.add(f.get());
        pool.shutdown();
        Collections.sort(statuses);
        assertThat(statuses).containsExactly(201, 409);
    }

    @Test
    void b03_databaseRejectsOverlapsEvenWithoutTheService() {
        Reservation existing = reservations.findAll().stream()
                .filter(r -> r.getSlot() != null && r.getStatus().name().equals("CONFIRMED")
                        && r.getStartTime().toLocalDate().isAfter(TODAY))
                .findFirst().orElseThrow();
        Reservation clash = new Reservation();
        clash.setUser(existing.getUser());
        clash.setFacility(existing.getFacility());
        clash.setSlot(existing.getSlot());
        clash.setSlotLevel(existing.getSlotLevel());
        clash.setSlotNumber(existing.getSlotNumber());
        clash.setVehiclePlate("RAZ 999 Z");
        clash.setVehicleType(existing.getVehicleType());
        clash.setStartTime(existing.getStartTime());
        clash.setEndTime(existing.getEndTime());
        clash.setHoldUntil(existing.getEndTime());
        clash.setAmount(100);
        clash.attachPayment(new Payment());
        assertThatThrownBy(() -> reservations.saveAndFlush(clash)).isInstanceOf(DataIntegrityViolationException.class);
    }

    // ---- reschedule, payment ---------------------------------------------------------------

    @Test
    void c01_rescheduleRules() throws Exception {
        MockHttpSession driver = login("driver@karita.rw");
        String date = TODAY.plusDays(4).toString();
        String serial = reserve(driver, "kcc", date, "09:00");
        String url = "/api/reservations/" + serial;
        mvc.perform(json(patch(url), "{\"start\":\"" + date + " 09:00\",\"end\":\"" + date + " 23:00\"}").session(driver))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.field").value("end"))
                .andExpect(jsonPath("$.error").value("The facility closes at 22:00."));
        mvc.perform(json(patch(url), "{\"start\":\"" + date + " 9:00\",\"end\":\"" + date + " 12:00\"}").session(driver))
                .andExpect(jsonPath("$.field").value("start"));
        mvc.perform(json(patch(url), "{\"start\":\"" + date + " 09:15\",\"end\":\"" + date + " 12:00\"}").session(driver))
                .andExpect(jsonPath("$.error").value("Start on the hour or half hour."));
        mvc.perform(json(patch(url), "{\"start\":\"" + date + " 10:00\",\"end\":\"" + date + " 13:00\"}").session(driver))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reservation.duration").value("3 HOURS"))
                .andExpect(jsonPath("$.reservation.amount").value(1500));
        // once paid, the length is fixed
        mvc.perform(json(post(url + "/payment"), "{\"method\":\"Mobile Money\",\"phone\":\"0788123456\"}").session(driver))
                .andExpect(status().isOk());
        mvc.perform(json(patch(url), "{\"start\":\"" + date + " 10:00\",\"end\":\"" + date + " 15:00\"}").session(driver))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("This reservation is paid, so it must stay 3 hours long."));
    }

    @Test
    void c02_paymentValidationDeclineAndCash() throws Exception {
        MockHttpSession driver = login("driver@karita.rw");
        String date = TODAY.plusDays(5).toString();
        String url = "/api/reservations/" + reserve(driver, "bk-arena", date, "12:00") + "/payment";
        mvc.perform(json(post(url), "{\"method\":\"Mobile Money\",\"phone\":\"12345\"}").session(driver))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fields.phone").exists());
        mvc.perform(json(post(url), "{\"method\":\"Card\",\"cardNumber\":\"4242 4242 4242 4241\",\"expiry\":\"01/20\",\"cvc\":\"1\"}").session(driver))
                .andExpect(jsonPath("$.fields.cardNumber").value("Check the card number."))
                .andExpect(jsonPath("$.fields.expiry").value("This card has expired."))
                .andExpect(jsonPath("$.fields.cvc").value("3 or 4 digits."));
        mvc.perform(json(post(url), "{\"method\":\"Card\",\"cardNumber\":\"4000 0000 0000 0002\",\"expiry\":\"12/39\",\"cvc\":\"123\"}").session(driver))
                .andExpect(status().isPaymentRequired())
                .andExpect(jsonPath("$.reservation.payment.status").value("Failed"));
        mvc.perform(json(post(url), "{\"method\":\"Cash\"}").session(driver))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reservation.payment.status").value("Pending"))
                .andExpect(jsonPath("$.reservation.payment.method").value("Cash"));
    }

    // ---- attendant -------------------------------------------------------------------------------

    @Test
    void d01_attendantFlowAndNoShowTiming() throws Exception {
        MockHttpSession att = login("attendant@karita.rw");
        // seeded: RAD 482 C paid at B1 B3 from 10:00; RAC 117 B cash at B2 C11 from 11:00
        String paid = JsonPath.read(body(mvc.perform(get("/api/attendant/verify").param("plate", "rad482c").session(att))
                .andExpect(status().isOk()).andReturn()), "$.reservation.serial");
        String unpaid = JsonPath.read(body(mvc.perform(get("/api/attendant/verify").param("slot", "B2 C11").session(att))
                .andExpect(status().isOk()).andReturn()), "$.reservation.serial");

        mvc.perform(post("/api/attendant/reservations/" + unpaid + "/occupy").session(att)).andExpect(status().isConflict());
        mvc.perform(post("/api/attendant/reservations/" + paid + "/no-show").session(att)).andExpect(status().isConflict());

        CLOCK.advance(Duration.ofMinutes(20));
        mvc.perform(post("/api/attendant/reservations/" + paid + "/occupy").session(att))
                .andExpect(jsonPath("$.reservation.state").value("Parked"));
        mvc.perform(get("/api/attendant/board").session(att))
                .andExpect(jsonPath("$.levels[0].rows[1].slots[2].id").value("B3"))
                .andExpect(jsonPath("$.levels[0].rows[1].slots[2].status").value("Occupied"));
        mvc.perform(post("/api/attendant/reservations/" + paid + "/release").session(att))
                .andExpect(jsonPath("$.reservation.state").value("Left"));
        mvc.perform(get("/api/attendant/board").session(att))
                .andExpect(jsonPath("$.levels[0].rows[1].slots[2].status").value("Available"));

        mvc.perform(post("/api/attendant/reservations/" + unpaid + "/cash").session(att))
                .andExpect(jsonPath("$.reservation.payment.status").value("Paid"));
        mvc.perform(get("/api/attendant/verify").param("plate", "ZZ 000 Z").session(att))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("No reservation found for this plate."));
    }

    // ---- admin -----------------------------------------------------------------------------------

    @Test
    void e01_adminCrudGuardsAndRevenue() throws Exception {
        MockHttpSession admin = login("admin@karita.rw");
        mvc.perform(delete("/api/admin/facilities/kbc").session(admin))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("This facility has reservation history. Deactivate it instead of deleting."));
        mvc.perform(delete("/api/admin/facilities/kigali-heights").session(admin))
                .andExpect(jsonPath("$.error").value("An attendant is assigned to this facility. Reassign them first."));

        mvc.perform(json(post("/api/admin/facilities"), "{\"name\":\"\",\"rate\":\"5\",\"levels\":\"\"}").session(admin))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fields.name").exists())
                .andExpect(jsonPath("$.fields.rate").exists())
                .andExpect(jsonPath("$.fields.levels").exists());
        mvc.perform(json(post("/api/admin/facilities"),
                        "{\"name\":\"Test Lot\",\"address\":\"KN 1 St\",\"city\":\"Kigali\",\"type\":\"Office\",\"rate\":\"300\",\"levels\":\"g, p1\"}")
                        .session(admin))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.facility.id").value("test-lot"))
                .andExpect(jsonPath("$.facility.levels[1]").value("P1"));
        MvcResult created = mvc.perform(json(post("/api/admin/slots"),
                        "{\"facilityId\":\"test-lot\",\"level\":\"G\",\"slotNumber\":\"a1\",\"vehicleType\":\"Car\"}").session(admin))
                .andExpect(status().isCreated()).andReturn();
        Integer slotId = JsonPath.read(body(created), "$.slot.slotId");
        mvc.perform(json(post("/api/admin/slots"),
                        "{\"facilityId\":\"test-lot\",\"level\":\"G\",\"slotNumber\":\"A1\",\"vehicleType\":\"Car\"}").session(admin))
                .andExpect(jsonPath("$.fields.slotNumber").value("A1 already exists on level G."));
        mvc.perform(json(patch("/api/admin/slots/" + slotId), "{\"vehicleType\":\"SUV\",\"active\":false}").session(admin))
                .andExpect(jsonPath("$.slot.vehicleType").value("SUV"))
                .andExpect(jsonPath("$.slot.status").value("Inactive"));
        mvc.perform(delete("/api/admin/slots/" + slotId).session(admin)).andExpect(jsonPath("$.ok").value(true));
        mvc.perform(delete("/api/admin/facilities/test-lot").session(admin)).andExpect(jsonPath("$.ok").value(true));

        String revenue = body(mvc.perform(get("/api/admin/revenue").session(admin)).andExpect(status().isOk()).andReturn());
        List<Map<String, Object>> rows = JsonPath.read(revenue, "$.rows");
        assertThat(rows).hasSize(24);
        Number total = JsonPath.read(revenue, "$.total.revenue");
        assertThat(total.longValue()).isPositive();

        mvc.perform(get("/api/admin/reservations").param("status", "Cancelled").session(admin))
                .andExpect(jsonPath("$.reservations[*].display").value(org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.is("Cancelled"))));
    }
}

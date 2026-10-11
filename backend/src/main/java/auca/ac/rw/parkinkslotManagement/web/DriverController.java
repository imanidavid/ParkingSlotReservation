package auca.ac.rw.parkinkslotManagement.web;

import auca.ac.rw.parkinkslotManagement.service.FacilityService;
import auca.ac.rw.parkinkslotManagement.service.ReservationService;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Driver routes (role user). */
@RestController
public class DriverController {

    private final FacilityService facilities;
    private final ReservationService reservations;

    public DriverController(FacilityService facilities, ReservationService reservations) {
        this.facilities = facilities;
        this.reservations = reservations;
    }

    @GetMapping("/api/home")
    public Map<String, Object> home(@RequestAttribute(Session.REQUEST_UID) Long uid) {
        return facilities.home(uid);
    }

    @GetMapping("/api/facilities")
    public Map<String, Object> list(
            @RequestParam(required = false) String date, @RequestParam(required = false) String duration) {
        return facilities.list(date, duration);
    }

    @GetMapping("/api/facilities/{code}")
    public Map<String, Object> detail(@PathVariable String code, @RequestParam Map<String, String> query) {
        return facilities.detail(code, query);
    }

    @PostMapping("/api/reservations")
    public ResponseEntity<Map<String, Object>> reserve(
            @RequestAttribute(Session.REQUEST_UID) Long uid, @RequestBody Map<String, Object> body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("reservation", reservations.reserve(uid, body)));
    }

    @GetMapping("/api/reservations")
    public Map<String, Object> mine(@RequestAttribute(Session.REQUEST_UID) Long uid) {
        return reservations.listFor(uid);
    }

    @GetMapping("/api/reservations/{serial:\\d{5}}")
    public Map<String, Object> one(@RequestAttribute(Session.REQUEST_UID) Long uid, @PathVariable String serial) {
        return Map.of("reservation", reservations.get(uid, serial));
    }

    @PatchMapping("/api/reservations/{serial:\\d{5}}")
    public Map<String, Object> reschedule(
            @RequestAttribute(Session.REQUEST_UID) Long uid, @PathVariable String serial,
            @RequestBody Map<String, Object> body) {
        return Map.of("reservation", reservations.reschedule(uid, serial, body));
    }

    @PostMapping("/api/reservations/{serial:\\d{5}}/cancel")
    public Map<String, Object> cancel(@RequestAttribute(Session.REQUEST_UID) Long uid, @PathVariable String serial) {
        return Map.of("reservation", reservations.cancel(uid, serial));
    }

    @PostMapping("/api/reservations/{serial:\\d{5}}/payment")
    public ResponseEntity<Map<String, Object>> pay(
            @RequestAttribute(Session.REQUEST_UID) Long uid, @PathVariable String serial,
            @RequestBody Map<String, Object> body) {
        ReservationService.PayResult result = reservations.pay(uid, serial, body);
        if (result.declined() != null) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("error", result.declined());
            out.put("reservation", result.reservation());
            return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(out);
        }
        return ResponseEntity.ok(Map.of("reservation", result.reservation()));
    }
}

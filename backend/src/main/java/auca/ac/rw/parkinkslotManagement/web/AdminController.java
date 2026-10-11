package auca.ac.rw.parkinkslotManagement.web;

import auca.ac.rw.parkinkslotManagement.service.AdminService;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Admin routes: facilities, parking slots, all reservations, occupancy & revenue. */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService admin;

    public AdminController(AdminService admin) {
        this.admin = admin;
    }

    @GetMapping("/facilities")
    public Map<String, Object> facilities() {
        return admin.facilities();
    }

    @PostMapping("/facilities")
    public ResponseEntity<Map<String, Object>> createFacility(
            @RequestAttribute(Session.REQUEST_UID) Long uid, @RequestBody Map<String, Object> body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(admin.createFacility(uid, body));
    }

    @PatchMapping("/facilities/{code}")
    public Map<String, Object> updateFacility(
            @RequestAttribute(Session.REQUEST_UID) Long uid, @PathVariable String code,
            @RequestBody Map<String, Object> body) {
        return admin.updateFacility(uid, code, body);
    }

    @DeleteMapping("/facilities/{code}")
    public Map<String, Object> deleteFacility(
            @RequestAttribute(Session.REQUEST_UID) Long uid, @PathVariable String code) {
        return admin.deleteFacility(uid, code);
    }

    @GetMapping("/slots")
    public Map<String, Object> slots(
            @RequestParam(required = false) String facility, @RequestParam(required = false) String level) {
        return admin.slots(facility, level);
    }

    @PostMapping("/slots")
    public ResponseEntity<Map<String, Object>> createSlot(
            @RequestAttribute(Session.REQUEST_UID) Long uid, @RequestBody Map<String, Object> body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(admin.createSlot(uid, body));
    }

    @PatchMapping("/slots/{id:\\d+}")
    public Map<String, Object> updateSlot(
            @RequestAttribute(Session.REQUEST_UID) Long uid, @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        return admin.updateSlot(uid, id, body);
    }

    @DeleteMapping("/slots/{id:\\d+}")
    public Map<String, Object> deleteSlot(
            @RequestAttribute(Session.REQUEST_UID) Long uid, @PathVariable Long id) {
        return admin.deleteSlot(uid, id);
    }

    @GetMapping("/reservations")
    public Map<String, Object> reservations(
            @RequestParam(required = false) String facility,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String date) {
        return admin.reservations(facility, status, date);
    }

    @PostMapping("/reservations/{serial:\\d{5}}/cancel")
    public Map<String, Object> cancel(
            @RequestAttribute(Session.REQUEST_UID) Long uid, @PathVariable String serial) {
        return admin.cancel(uid, serial);
    }

    @GetMapping("/audit")
    public Map<String, Object> audit(
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String facility,
            @RequestParam(defaultValue = "100") int limit) {
        return admin.auditLog(action, facility, Math.min(Math.max(limit, 1), 500));
    }

    @GetMapping("/notifications")
    public Map<String, Object> notifications(
            @RequestParam(required = false) String serial,
            @RequestParam(defaultValue = "100") int limit) {
        return admin.notifications(serial, Math.min(Math.max(limit, 1), 500));
    }

    @GetMapping("/revenue")
    public Map<String, Object> revenue() {
        return admin.revenue();
    }
}

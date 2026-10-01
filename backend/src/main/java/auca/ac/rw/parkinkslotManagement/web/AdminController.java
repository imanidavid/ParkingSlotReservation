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
    public ResponseEntity<Map<String, Object>> createFacility(@RequestBody Map<String, Object> body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(admin.createFacility(body));
    }

    @PatchMapping("/facilities/{code}")
    public Map<String, Object> updateFacility(@PathVariable String code, @RequestBody Map<String, Object> body) {
        return admin.updateFacility(code, body);
    }

    @DeleteMapping("/facilities/{code}")
    public Map<String, Object> deleteFacility(@PathVariable String code) {
        return admin.deleteFacility(code);
    }

    @GetMapping("/slots")
    public Map<String, Object> slots(
            @RequestParam(required = false) String facility, @RequestParam(required = false) String level) {
        return admin.slots(facility, level);
    }

    @PostMapping("/slots")
    public ResponseEntity<Map<String, Object>> createSlot(@RequestBody Map<String, Object> body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(admin.createSlot(body));
    }

    @PatchMapping("/slots/{id:\\d+}")
    public Map<String, Object> updateSlot(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        return admin.updateSlot(id, body);
    }

    @DeleteMapping("/slots/{id:\\d+}")
    public Map<String, Object> deleteSlot(@PathVariable Long id) {
        return admin.deleteSlot(id);
    }

    @GetMapping("/reservations")
    public Map<String, Object> reservations(
            @RequestParam(required = false) String facility,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String date) {
        return admin.reservations(facility, status, date);
    }

    @PostMapping("/reservations/{serial:\\d{5}}/cancel")
    public Map<String, Object> cancel(@PathVariable String serial) {
        return admin.cancel(serial);
    }

    @GetMapping("/revenue")
    public Map<String, Object> revenue() {
        return admin.revenue();
    }
}

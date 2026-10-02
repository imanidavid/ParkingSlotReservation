package auca.ac.rw.parkinkslotManagement.web;

import auca.ac.rw.parkinkslotManagement.service.AttendantService;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Attendant routes, scoped to the attendant's facility. */
@RestController
@RequestMapping("/api/attendant")
public class AttendantController {

    private final AttendantService attendant;

    public AttendantController(AttendantService attendant) {
        this.attendant = attendant;
    }

    @GetMapping("/board")
    public Map<String, Object> board(@RequestAttribute(Session.REQUEST_UID) Long uid) {
        return attendant.board(uid);
    }

    @GetMapping("/today")
    public Map<String, Object> today(@RequestAttribute(Session.REQUEST_UID) Long uid) {
        return attendant.todayList(uid);
    }

    @GetMapping("/verify")
    public Map<String, Object> verify(
            @RequestAttribute(Session.REQUEST_UID) Long uid,
            @RequestParam(required = false) String plate,
            @RequestParam(required = false) String slot) {
        boolean byPlate = plate != null && !plate.isBlank();
        if (!byPlate && (slot == null || slot.isBlank())) throw ApiException.badRequest("Enter a plate number.");
        return attendant.verify(uid, plate, slot)
                .map(r -> Map.<String, Object>of("reservation", r))
                .orElseThrow(() -> ApiException.notFound(byPlate
                        ? "No reservation found for this plate."
                        : "No reservation found for this slot."));
    }

    @PostMapping("/reservations/{serial:\\d{5}}/{action:occupy|cash|release|no-show}")
    public Map<String, Object> act(
            @RequestAttribute(Session.REQUEST_UID) Long uid, @PathVariable String serial, @PathVariable String action) {
        Map<String, Object> r = switch (action) {
            case "occupy" -> attendant.occupy(uid, serial);
            case "cash" -> attendant.cash(uid, serial);
            case "release" -> attendant.release(uid, serial);
            default -> attendant.noShow(uid, serial);
        };
        return Map.of("reservation", r);
    }
}

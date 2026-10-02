package auca.ac.rw.parkinkslotManagement.web;

import auca.ac.rw.parkinkslotManagement.model.Role;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Optional;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Every /api call except sign-in/register needs a session (401 otherwise),
 * and each area needs its role (403): /api/admin → admin,
 * /api/attendant → attendant, other driver routes → user. /api/auth/me → anyone.
 */
@Component
public class ApiAuthInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) throws Exception {
        Optional<Long> uid = Session.userId(req);
        Optional<Role> role = Session.role(req);
        if (uid.isEmpty() || role.isEmpty()) {
            Session.writeError(res, 401, "Not signed in.");
            return false;
        }
        String path = req.getRequestURI().substring(req.getContextPath().length());
        Role needed = path.startsWith("/api/admin/") ? Role.ADMIN
                : path.startsWith("/api/attendant/") ? Role.ATTENDANT
                : path.equals("/api/auth/me") ? null
                : Role.USER;
        if (needed != null && role.get() != needed) {
            String who = switch (needed) {
                case ADMIN -> "Admin accounts only.";
                case ATTENDANT -> "Attendant accounts only.";
                case USER -> "Driver accounts only.";
            };
            Session.writeError(res, 403, who);
            return false;
        }
        req.setAttribute(Session.REQUEST_UID, uid.get());
        res.setHeader("Cache-Control", "no-store");
        return true;
    }
}

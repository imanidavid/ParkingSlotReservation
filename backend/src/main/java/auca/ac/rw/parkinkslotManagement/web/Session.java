package auca.ac.rw.parkinkslotManagement.web;

import auca.ac.rw.parkinkslotManagement.model.Role;
import auca.ac.rw.parkinkslotManagement.model.User;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.util.Optional;

/** Who is signed in, kept in the HTTP session. */
public final class Session {

    public static final String COOKIE = "KARITA_SESSION";
    static final String UID = "uid";
    static final String ROLE = "role";
    /** Request attribute holding the signed-in user's id, set by ApiAuthInterceptor. */
    public static final String REQUEST_UID = "uid";

    private Session() {}

    /** Starts a fresh session for the user (new id: no session fixation). */
    public static void signIn(HttpServletRequest req, User user) {
        HttpSession old = req.getSession(false);
        if (old != null) old.invalidate();
        HttpSession s = req.getSession(true);
        s.setAttribute(UID, user.getUserId());
        s.setAttribute(ROLE, user.getRole().name());
    }

    public static void signOut(HttpServletRequest req, HttpServletResponse res) {
        HttpSession s = req.getSession(false);
        if (s != null) s.invalidate();
        clearCookie(res);
    }

    public static Optional<Long> userId(HttpServletRequest req) {
        HttpSession s = req.getSession(false);
        return s == null ? Optional.empty() : Optional.ofNullable((Long) s.getAttribute(UID));
    }

    public static Optional<Role> role(HttpServletRequest req) {
        HttpSession s = req.getSession(false);
        Object r = s == null ? null : s.getAttribute(ROLE);
        return r == null ? Optional.empty() : Optional.of(Role.valueOf((String) r));
    }

    /** The browser sent a session cookie we no longer know: it expired or the server restarted. */
    public static boolean stale(HttpServletRequest req) {
        return req.getRequestedSessionId() != null && !req.isRequestedSessionIdValid();
    }

    public static void clearCookie(HttpServletResponse res) {
        Cookie c = new Cookie(COOKIE, "");
        c.setPath("/");
        c.setMaxAge(0);
        c.setHttpOnly(true);
        res.addCookie(c);
    }

    /** Minimal JSON error for filters/interceptors, which run outside the controller advice. */
    static void writeError(HttpServletResponse res, int status, String message) throws IOException {
        res.setStatus(status);
        res.setContentType("application/json;charset=UTF-8");
        res.setHeader("Cache-Control", "no-store");
        res.getWriter().write("{\"error\":\"" + message.replace("\\", "\\\\").replace("\"", "\\\"") + "\"}");
    }
}

package auca.ac.rw.parkinkslotManagement.web;

import auca.ac.rw.parkinkslotManagement.model.Role;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Page access: each page belongs to a role; signed-out visitors go to sign-in
 * (with ?reason=expired when their session ended), signed-in users can't see
 * the sign-in/register pages, and "/" goes to the right home page.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class PageAccessFilter extends OncePerRequestFilter {

    private static final Map<String, Role> PAGE_ROLES = Map.of(
            "/home.html", Role.USER,
            "/browse.html", Role.USER,
            "/facility.html", Role.USER,
            "/pay.html", Role.USER,
            "/ticket.html", Role.USER,
            "/reservations.html", Role.USER,
            "/attendant.html", Role.ATTENDANT,
            "/admin.html", Role.ADMIN);

    private static final Set<String> GUEST_ONLY = Set.of("/login.html", "/register.html");

    @Override
    protected boolean shouldNotFilter(HttpServletRequest req) {
        String path = path(req);
        return path.startsWith("/api/") || path.equals("/logout");
    }

    private static String path(HttpServletRequest req) {
        return req.getRequestURI().substring(req.getContextPath().length());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String path = path(req);
        Optional<Role> role = Session.role(req);

        if (path.equals("/")) {
            res.sendRedirect(role.map(r -> "/" + r.home()).orElse("/login.html"));
            return;
        }
        if (GUEST_ONLY.contains(path) && role.isPresent()) {
            res.sendRedirect("/" + role.get().home());
            return;
        }
        Role needed = PAGE_ROLES.get(path);
        if (needed != null) {
            if (role.isEmpty()) {
                String next = path.substring(1) + (req.getQueryString() == null ? "" : "?" + req.getQueryString());
                String target = "/login.html?" + (Session.stale(req) ? "reason=expired&" : "")
                        + "next=" + URLEncoder.encode(next, StandardCharsets.UTF_8);
                if (Session.stale(req)) Session.clearCookie(res);
                res.sendRedirect(target);
                return;
            }
            if (role.get() != needed) {
                res.sendRedirect("/" + role.get().home());
                return;
            }
        }
        if (path.endsWith(".html")) {
            // signed-in pages must not come back from the cache after sign-out
            res.setHeader("Cache-Control", "no-store");
        }
        chain.doFilter(req, res);
    }
}

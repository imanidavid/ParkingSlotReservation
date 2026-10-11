package auca.ac.rw.parkinkslotManagement.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import java.util.Set;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * CSRF defence for the cookie session: API writes must come from this origin.
 * Browsers send Origin (and Sec-Fetch-Site) on cross-site POST/PATCH/DELETE.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class OriginCheckFilter extends OncePerRequestFilter {

    private static final Set<String> SAFE = Set.of("GET", "HEAD", "OPTIONS");

    @Override
    protected boolean shouldNotFilter(HttpServletRequest req) {
        return SAFE.contains(req.getMethod()) || !req.getRequestURI().startsWith(req.getContextPath() + "/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        if ("cross-site".equals(req.getHeader("Sec-Fetch-Site")) || !sameOrigin(req)) {
            Session.writeError(res, 403, "Cross-site requests are not allowed.");
            return;
        }
        chain.doFilter(req, res);
    }

    private static boolean sameOrigin(HttpServletRequest req) {
        String origin = req.getHeader("Origin");
        if (origin == null || origin.equals("null")) return origin == null;
        String host = req.getHeader("Host");
        try {
            URI u = URI.create(origin);
            String originHost = u.getHost() + (u.getPort() == -1 ? "" : ":" + u.getPort());
            return host != null && host.equalsIgnoreCase(originHost);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}

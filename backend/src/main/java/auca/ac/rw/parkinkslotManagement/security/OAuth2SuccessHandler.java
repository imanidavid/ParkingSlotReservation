package auca.ac.rw.parkinkslotManagement.security;

import auca.ac.rw.parkinkslotManagement.model.Role;
import auca.ac.rw.parkinkslotManagement.model.User;
import auca.ac.rw.parkinkslotManagement.service.FederatedLoginService;
import auca.ac.rw.parkinkslotManagement.web.Session;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

/**
 * Turns a completed Google sign-in into an ordinary Karita session.
 *
 * <p>The rest of the application knows one way of telling who you are: a user id
 * and a role on the {@code HttpSession}. Rather than teach every filter about a
 * second mechanism, the OAuth2 handshake ends here and we mint exactly the same
 * session that a password login does — after which every page, role check and
 * ownership rule behaves identically no matter how the person signed in.
 *
 * <p>Spring Security's own authentication is cleared on the way out for the same
 * reason: one source of truth.
 */
@Component
public class OAuth2SuccessHandler implements AuthenticationSuccessHandler {

    private static final Logger log = LoggerFactory.getLogger(OAuth2SuccessHandler.class);

    private final FederatedLoginService federated;

    public OAuth2SuccessHandler(FederatedLoginService federated) {
        this.federated = federated;
    }

    @Override
    public void onAuthenticationSuccess(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException, ServletException {

        OAuth2User principal = (OAuth2User) authentication.getPrincipal();
        String email = attr(principal, "email");
        Boolean verified = principal.getAttribute("email_verified");

        if (email == null || email.isBlank()) {
            fail(response, "Your Google account didn't share an email address.");
            return;
        }
        // An unverified address at the provider would let someone claim another
        // person's account simply by typing their address into a new profile.
        if (Boolean.FALSE.equals(verified)) {
            fail(response, "Verify your email address with Google first.");
            return;
        }

        User user = federated.findOrCreate(email, attr(principal, "name"));
        SecurityContextHolder.clearContext();
        Session.signIn(request, user);

        Role role = user.getRole();
        log.info("OAuth2 sign-in for {} ({})", user.getEmail(), role);
        response.sendRedirect("/" + role.home());
    }

    private static String attr(OAuth2User user, String name) {
        Object value = user.getAttribute(name);
        return value == null ? null : value.toString();
    }

    private static void fail(HttpServletResponse response, String message) throws IOException {
        response.sendRedirect("/login.html?error=" + URLEncoder.encode(message, StandardCharsets.UTF_8));
    }
}

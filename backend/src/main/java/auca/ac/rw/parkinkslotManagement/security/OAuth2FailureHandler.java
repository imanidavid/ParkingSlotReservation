package auca.ac.rw.parkinkslotManagement.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.stereotype.Component;

/**
 * Sends a failed Google sign-in back to the sign-in page with something a person
 * can read, instead of Spring Security's default error page. The underlying
 * cause goes to the log, not to the browser.
 */
@Component
public class OAuth2FailureHandler implements AuthenticationFailureHandler {

    private static final Logger log = LoggerFactory.getLogger(OAuth2FailureHandler.class);

    @Override
    public void onAuthenticationFailure(
            HttpServletRequest request, HttpServletResponse response, AuthenticationException exception)
            throws IOException {
        log.warn("OAuth2 sign-in failed: {}", exception.getMessage());
        String message = "Google sign-in didn't complete. Try again, or use your email and password.";
        response.sendRedirect("/login.html?error=" + URLEncoder.encode(message, StandardCharsets.UTF_8));
    }
}

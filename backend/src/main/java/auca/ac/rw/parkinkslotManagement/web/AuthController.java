package auca.ac.rw.parkinkslotManagement.web;

import auca.ac.rw.parkinkslotManagement.model.User;
import auca.ac.rw.parkinkslotManagement.service.AuthService;
import auca.ac.rw.parkinkslotManagement.service.Body;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService auth;
    private final ObjectProvider<ClientRegistrationRepository> clients;

    public AuthController(AuthService auth, ObjectProvider<ClientRegistrationRepository> clients) {
        this.auth = auth;
        this.clients = clients;
    }

    /**
     * Which federated sign-in buttons the page should show. Open to signed-out
     * visitors, because the sign-in page needs it before anyone has a session.
     */
    @GetMapping("/providers")
    public Map<String, Object> providers() {
        List<Map<String, String>> list = new ArrayList<>();
        ClientRegistrationRepository repo = clients.getIfAvailable();
        if (repo instanceof InMemoryClientRegistrationRepository registrations) {
            for (ClientRegistration r : registrations) {
                list.add(Map.of(
                        "id", r.getRegistrationId(),
                        "name", r.getClientName() == null ? r.getRegistrationId() : r.getClientName(),
                        "url", "/oauth2/authorization/" + r.getRegistrationId()));
            }
        }
        return Map.of("providers", list);
    }

    private static Map<String, Object> signedIn(User u) {
        return Map.of(
                "redirect", u.getRole().home(),
                "user", Map.of("email", u.getEmail(), "role", u.getRole().json()));
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = auth.login(Body.str(body, "email"), Body.str(body, "password"), req.getRemoteAddr());
        Session.signIn(req, u);
        return signedIn(u);
    }

    @PostMapping("/register")
    public ResponseEntity<Map<String, Object>> register(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = auth.register(body);
        Session.signIn(req, u);
        return ResponseEntity.status(HttpStatus.CREATED).body(signedIn(u));
    }

    @GetMapping("/me")
    public Map<String, Object> me(@RequestAttribute(Session.REQUEST_UID) Long uid) {
        return auth.me(uid);
    }
}

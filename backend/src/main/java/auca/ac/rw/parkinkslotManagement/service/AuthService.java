package auca.ac.rw.parkinkslotManagement.service;

import auca.ac.rw.parkinkslotManagement.model.Role;
import auca.ac.rw.parkinkslotManagement.model.User;
import auca.ac.rw.parkinkslotManagement.model.VehicleType;
import auca.ac.rw.parkinkslotManagement.repository.UserRepository;
import auca.ac.rw.parkinkslotManagement.web.ApiException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private static final String EMAIL = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$";

    private final UserRepository users;
    private final PasswordHasher hasher;
    private final LoginThrottle throttle;

    public AuthService(UserRepository users, PasswordHasher hasher, LoginThrottle throttle) {
        this.users = users;
        this.hasher = hasher;
        this.throttle = throttle;
    }

    /** Plates: letters/digits/spaces, 4–12 chars, at least one digit. "rad482c" stays "RAD482C". */
    public static Optional<String> cleanPlate(String value) {
        String p = value == null ? "" : value.toUpperCase().replaceAll("\\s+", " ").trim();
        return p.matches("[A-Z0-9 ]{4,12}") && p.matches(".*\\d.*") ? Optional.of(p) : Optional.empty();
    }

    @Transactional(readOnly = true)
    public User login(String emailValue, String password, String ip) {
        String email = emailValue == null ? "" : emailValue.trim().toLowerCase();
        if (throttle.blocked(email, ip)) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Too many sign-in attempts. Wait a few minutes and try again.");
        }
        Optional<User> user = users.findByEmailIgnoreCase(email);
        boolean ok = hasher.matches(password == null ? "" : password, user.map(User::getPasswordHash).orElse(null));
        if (!ok || user.isEmpty()) {
            throttle.failed(email, ip);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Email or password is incorrect.");
        }
        throttle.succeeded(email, ip);
        return user.get();
    }

    /** Same rules and messages as the register page's own checks. */
    @Transactional
    public User register(Map<String, Object> body) {
        Map<String, String> fields = new LinkedHashMap<>();
        String fullName = Body.str(body, "fullName").trim().replaceAll("\\s+", " ");
        String email = Body.str(body, "email").trim().toLowerCase();
        String password = Body.str(body, "password");
        Optional<String> plate = cleanPlate(Body.str(body, "plate"));
        Optional<VehicleType> vehicle = VehicleType.fromLabel(Body.str(body, "vehicle"));

        if (fullName.length() < 2 || fullName.length() > 80) fields.put("fullName", "Enter your full name (2–80 characters).");
        boolean duplicate = false;
        if (!email.matches(EMAIL) || email.length() > 120) {
            fields.put("email", "Enter a valid email address.");
        } else if (users.existsByEmailIgnoreCase(email)) {
            fields.put("email", "This email is already registered. Sign in instead.");
            duplicate = true;
        }
        if (password.length() < 8) fields.put("password", "Use at least 8 characters.");
        else if (password.length() > 128) fields.put("password", "Use at most 128 characters.");
        else if (!password.matches(".*[A-Za-z].*") || !password.matches(".*\\d.*")) fields.put("password", "Use letters and at least one number.");
        if (plate.isEmpty()) fields.put("plate", "Enter your plate, e.g. RAD 482 C.");
        if (vehicle.isEmpty()) fields.put("vehicle", "Choose your vehicle type.");

        if (!fields.isEmpty()) {
            throw ApiException.fields(duplicate && fields.size() == 1 ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST, fields);
        }

        User u = new User();
        u.setFullName(fullName);
        u.setEmail(email);
        u.setPasswordHash(hasher.hash(password));
        u.setRole(Role.USER);
        u.setPlate(plate.get());
        u.setVehicleType(vehicle.get());
        return users.save(u);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> me(Long userId) {
        User u = users.findById(userId).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Not signed in."));
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("fullName", u.getFullName());
        m.put("email", u.getEmail());
        m.put("role", u.getRole().json());
        m.put("plate", u.getPlate());
        m.put("vehicle", u.getVehicleType() == null ? null : u.getVehicleType().label());
        m.put("facility", u.getAssignedFacility() == null ? null : u.getAssignedFacility().getName());
        return m;
    }
}

package auca.ac.rw.parkinkslotManagement.service;

import auca.ac.rw.parkinkslotManagement.model.Role;
import auca.ac.rw.parkinkslotManagement.model.User;
import auca.ac.rw.parkinkslotManagement.repository.UserRepository;
import java.security.SecureRandom;
import java.util.Base64;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Links a verified provider identity to a Karita account, creating one on first
 * sign-in.
 *
 * <p>Matching is by email, which is the only identifier both sides share. That
 * means an attendant or admin whose account email matches their Google address
 * signs in through Google and keeps their role — the account is looked up, never
 * replaced, so roles can't be escalated by arriving through a different door.
 * Only genuinely new people are created, and always as drivers.
 */
@Service
public class FederatedLoginService {

    private final UserRepository users;
    private final PasswordHasher hasher;
    private final SecureRandom random = new SecureRandom();

    public FederatedLoginService(UserRepository users, PasswordHasher hasher) {
        this.users = users;
        this.hasher = hasher;
    }

    @Transactional
    public User findOrCreate(String emailValue, String fullName) {
        String email = emailValue.trim().toLowerCase();
        return users.findByEmailIgnoreCase(email).orElseGet(() -> create(email, fullName));
    }

    private User create(String email, String fullName) {
        User u = new User();
        u.setEmail(email);
        u.setFullName(displayName(fullName, email));
        // There's no password to store, but the column is NOT NULL and a fixed
        // placeholder would be a shared credential across every federated
        // account. An unguessable random one can't be used to sign in, and the
        // person can still set a real password later.
        u.setPasswordHash(hasher.hash(randomSecret()));
        u.setRole(Role.USER);
        return users.save(u);
    }

    /** Google usually supplies a name; fall back to the part before the @. */
    private static String displayName(String fullName, String email) {
        String name = fullName == null ? "" : fullName.trim().replaceAll("\\s+", " ");
        if (name.length() >= 2) return name.length() > 80 ? name.substring(0, 80) : name;
        String local = email.split("@")[0];
        return local.length() < 2 ? "Driver" : local.length() > 80 ? local.substring(0, 80) : local;
    }

    private String randomSecret() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}

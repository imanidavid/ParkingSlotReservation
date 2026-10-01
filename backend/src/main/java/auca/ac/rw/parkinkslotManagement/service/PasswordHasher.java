package auca.ac.rw.parkinkslotManagement.service;

import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.stereotype.Component;

/** PBKDF2-HMAC-SHA256 with a random salt. Stored as "pbkdf2$iterations$salt$hash". */
@Component
public class PasswordHasher {

    private static final int ITERATIONS = 210_000;
    private static final int KEY_BITS = 256;
    private final SecureRandom random = new SecureRandom();

    /** Compared against when the email is unknown, so timing doesn't reveal accounts. */
    private final String dummy = hash("not-a-real-password");

    public String hash(String password) {
        byte[] salt = new byte[16];
        random.nextBytes(salt);
        byte[] key = derive(password, salt, ITERATIONS);
        Base64.Encoder b64 = Base64.getEncoder();
        return "pbkdf2$" + ITERATIONS + "$" + b64.encodeToString(salt) + "$" + b64.encodeToString(key);
    }

    public boolean matches(String password, String stored) {
        String[] parts = (stored == null ? dummy : stored).split("\\$");
        if (parts.length != 4) return false;
        int iterations = Integer.parseInt(parts[1]);
        byte[] salt = Base64.getDecoder().decode(parts[2]);
        byte[] expected = Base64.getDecoder().decode(parts[3]);
        boolean ok = MessageDigest.isEqual(derive(password, salt, iterations), expected);
        return stored != null && ok;
    }

    private static byte[] derive(String password, byte[] salt, int iterations) {
        try {
            PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, KEY_BITS);
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}

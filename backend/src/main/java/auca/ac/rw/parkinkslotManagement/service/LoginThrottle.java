package auca.ac.rw.parkinkslotManagement.service;

import java.time.Clock;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/** At most 10 failed sign-ins per email + IP in 15 minutes. */
@Component
public class LoginThrottle {

    static final int MAX_FAILURES = 10;
    static final long WINDOW_MS = 15 * 60 * 1000L;

    private final Map<String, Deque<Long>> failures = new ConcurrentHashMap<>();
    private final Clock clock;

    public LoginThrottle(Clock clock) {
        this.clock = clock;
    }

    private static String key(String email, String ip) {
        return email.toLowerCase() + "|" + ip;
    }

    public boolean blocked(String email, String ip) {
        Deque<Long> q = failures.get(key(email, ip));
        if (q == null) return false;
        synchronized (q) {
            prune(q);
            return q.size() >= MAX_FAILURES;
        }
    }

    public void failed(String email, String ip) {
        Deque<Long> q = failures.computeIfAbsent(key(email, ip), k -> new ArrayDeque<>());
        synchronized (q) {
            prune(q);
            q.addLast(clock.millis());
        }
    }

    public void succeeded(String email, String ip) {
        failures.remove(key(email, ip));
    }

    private void prune(Deque<Long> q) {
        long cutoff = clock.millis() - WINDOW_MS;
        while (!q.isEmpty() && q.peekFirst() < cutoff) q.pollFirst();
    }
}

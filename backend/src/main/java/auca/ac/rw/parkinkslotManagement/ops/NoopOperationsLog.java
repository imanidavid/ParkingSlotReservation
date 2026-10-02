package auca.ac.rw.parkinkslotManagement.ops;

import java.util.List;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

/** Used when {@code karita.audit.enabled=false} — no MongoDB required. */
@Service
@ConditionalOnProperty(name = "karita.audit.enabled", havingValue = "false")
public class NoopOperationsLog implements OperationsLog {

    @Override
    public void audit(String action, Long actorId, String actorEmail, String actorRole,
            String target, String facility, Map<String, Object> details) {}

    @Override
    public void notified(NotificationRecord record) {}

    @Override
    public List<AuditEvent> recentAudit(String action, String facility, int limit) {
        return List.of();
    }

    @Override
    public List<NotificationRecord> recentNotifications(String serial, int limit) {
        return List.of();
    }
}

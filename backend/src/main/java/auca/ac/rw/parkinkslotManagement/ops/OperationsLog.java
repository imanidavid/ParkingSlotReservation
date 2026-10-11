package auca.ac.rw.parkinkslotManagement.ops;

import java.util.List;
import java.util.Map;

/**
 * The document side of the system: an append-only record of what staff did and
 * what drivers were told. Separate from the reservation data in PostgreSQL,
 * which is where anything with relationships and constraints belongs.
 */
public interface OperationsLog {

    void audit(String action, Long actorId, String actorEmail, String actorRole,
            String target, String facility, Map<String, Object> details);

    void notified(NotificationRecord record);

    List<AuditEvent> recentAudit(String action, String facility, int limit);

    List<NotificationRecord> recentNotifications(String serial, int limit);
}

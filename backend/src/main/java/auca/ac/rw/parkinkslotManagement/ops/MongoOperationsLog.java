package auca.ac.rw.parkinkslotManagement.ops;

import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DataAccessException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

/**
 * MongoDB-backed operations log.
 *
 * <p>Writes are best-effort for the same reason the broker publish is: by the
 * time we're logging that a slot was deleted, it has been deleted. Losing the
 * audit line is bad; refusing the admin's action because the log database is
 * unreachable is worse. Failures are logged at error level so they're visible
 * rather than silent.
 */
@Service
@ConditionalOnProperty(name = "karita.audit.enabled", havingValue = "true", matchIfMissing = true)
public class MongoOperationsLog implements OperationsLog {

    private static final Logger log = LoggerFactory.getLogger(MongoOperationsLog.class);

    private final AuditEventRepository audits;
    private final NotificationRecordRepository notifications;

    public MongoOperationsLog(AuditEventRepository audits, NotificationRecordRepository notifications) {
        this.audits = audits;
        this.notifications = notifications;
    }

    @Override
    public void audit(String action, Long actorId, String actorEmail, String actorRole,
            String target, String facility, Map<String, Object> details) {
        try {
            audits.save(AuditEvent.of(action, actorId, actorEmail, actorRole, target, facility, details));
        } catch (DataAccessException e) {
            log.error("Could not write audit event {} for {}: {}", action, target, e.getMessage());
        }
    }

    @Override
    public void notified(NotificationRecord record) {
        try {
            notifications.save(record);
        } catch (DataAccessException e) {
            log.error("Could not write notification record for {}: {}", record.serial(), e.getMessage());
        }
    }

    @Override
    public List<AuditEvent> recentAudit(String action, String facility, int limit) {
        PageRequest page = PageRequest.ofSize(limit);
        try {
            if (action != null && !action.isBlank()) return audits.findByActionOrderByAtDesc(action, page);
            if (facility != null && !facility.isBlank()) return audits.findByFacilityOrderByAtDesc(facility, page);
            return audits.findAllByOrderByAtDesc(page);
        } catch (DataAccessException e) {
            log.error("Could not read the audit log: {}", e.getMessage());
            return List.of();
        }
    }

    @Override
    public List<NotificationRecord> recentNotifications(String serial, int limit) {
        try {
            return serial != null && !serial.isBlank()
                    ? notifications.findBySerialOrderByAtDesc(serial)
                    : notifications.findAllByOrderByAtDesc(PageRequest.ofSize(limit));
        } catch (DataAccessException e) {
            log.error("Could not read notification records: {}", e.getMessage());
            return List.of();
        }
    }
}

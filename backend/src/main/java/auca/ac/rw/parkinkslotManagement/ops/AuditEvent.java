package auca.ac.rw.parkinkslotManagement.ops;

import java.time.Instant;
import java.util.Map;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * One state-changing action by a staff account: who did what, to what, when.
 *
 * <p>Append-only and never joined, which is why it lives in MongoDB rather than
 * beside the reservations. The {@code details} map is the real reason: a slot
 * edit records old and new values, a cancellation records a reason, a check-in
 * records a plate. Modelling that relationally means either a column per action
 * type that's null for every other type, or a key/value side table nobody
 * enjoys querying. As a document it's just the shape it is.
 */
/* Indexes are created by OpsIndexes after startup, not by annotations. */
@Document(collection = "audit_events")
public record AuditEvent(
        @Id String id,
        Instant at,
        String action,
        Long actorId,
        String actorEmail,
        String actorRole,
        String target,
        String facility,
        Map<String, Object> details) {

    /** Actions worth keeping. Stored as plain strings so adding one needs no migration. */
    public static final String SLOT_CREATED = "SLOT_CREATED";
    public static final String SLOT_UPDATED = "SLOT_UPDATED";
    public static final String SLOT_DELETED = "SLOT_DELETED";
    public static final String FACILITY_CREATED = "FACILITY_CREATED";
    public static final String FACILITY_UPDATED = "FACILITY_UPDATED";
    public static final String FACILITY_DELETED = "FACILITY_DELETED";
    public static final String RESERVATION_CANCELLED = "RESERVATION_CANCELLED";
    public static final String CASH_RECORDED = "CASH_RECORDED";
    public static final String CHECKED_IN = "CHECKED_IN";
    public static final String RELEASED = "RELEASED";
    public static final String NO_SHOW = "NO_SHOW";

    public static AuditEvent of(
            String action, Long actorId, String actorEmail, String actorRole,
            String target, String facility, Map<String, Object> details) {
        return new AuditEvent(null, Instant.now(), action, actorId, actorEmail, actorRole, target, facility, details);
    }
}

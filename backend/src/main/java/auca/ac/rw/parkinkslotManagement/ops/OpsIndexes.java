package auca.ac.rw.parkinkslotManagement.ops;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataAccessException;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.stereotype.Component;

/**
 * Creates the operations-log indexes once the app is up.
 *
 * <p>Spring Data's {@code auto-index-creation} would do this too, but it runs
 * while the context is still starting and talks to MongoDB to do it — so a
 * MongoDB that isn't running takes the whole application down with it, which is
 * an absurd way to lose a parking system. Doing it here, after startup and
 * inside a try/catch, means a missing log database costs you the indexes and a
 * line in the log, nothing more.
 *
 * <p>Each index is created independently and named explicitly: unnamed indexes
 * get a generated name, which collides with an existing index on the same field
 * under a different name, and one such collision shouldn't stop the others
 * being created.
 */
@Component
@ConditionalOnProperty(name = "karita.audit.enabled", havingValue = "true", matchIfMissing = true)
public class OpsIndexes {

    private static final Logger log = LoggerFactory.getLogger(OpsIndexes.class);

    private final MongoTemplate mongo;

    public OpsIndexes(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void ensure() {
        int made = 0;
        made += create(AuditEvent.class, "ix_audit_at", "at", Sort.Direction.DESC);
        made += create(AuditEvent.class, "ix_audit_action", "action", Sort.Direction.ASC);
        made += create(NotificationRecord.class, "ix_notif_serial", "serial", Sort.Direction.ASC);
        made += create(NotificationRecord.class, "ix_notif_event", "eventId", Sort.Direction.ASC);
        if (made == 4) log.info("Operations-log indexes are in place");
    }

    private int create(Class<?> type, String name, String field, Sort.Direction direction) {
        try {
            mongo.indexOps(type).createIndex(new Index().on(field, direction).named(name));
            return 1;
        } catch (DataAccessException | IllegalStateException e) {
            log.warn("Operations-log index {} not created: {}", name, e.getMessage());
            return 0;
        }
    }
}

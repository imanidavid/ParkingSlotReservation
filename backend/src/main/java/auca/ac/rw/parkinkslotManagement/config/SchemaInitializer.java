package auca.ac.rw.parkinkslotManagement.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Database-level rules Hibernate can't express (doc §10.4):
 * no two CONFIRMED reservations may hold the same slot at overlapping times,
 * and time ranges must run forwards. Idempotent. Called by StartupData.
 */
@Component
public class SchemaInitializer {

    private static final Logger log = LoggerFactory.getLogger(SchemaInitializer.class);
    private final JdbcTemplate jdbc;

    public SchemaInitializer(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void apply() {
        jdbc.execute("CREATE EXTENSION IF NOT EXISTS btree_gist");
        addConstraint("reservations_no_overlap", """
                ALTER TABLE reservations ADD CONSTRAINT reservations_no_overlap
                EXCLUDE USING gist (slot_id WITH =, tsrange(start_time, hold_until) WITH &&)
                WHERE (status = 'CONFIRMED' AND slot_id IS NOT NULL)""");
        addConstraint("reservations_time_order", """
                ALTER TABLE reservations ADD CONSTRAINT reservations_time_order
                CHECK (end_time > start_time AND hold_until >= start_time AND hold_until <= end_time)""");
        addConstraint("reservations_amount_positive", """
                ALTER TABLE reservations ADD CONSTRAINT reservations_amount_positive CHECK (amount >= 0)""");
        addConstraint("facilities_rate_range", """
                ALTER TABLE facilities ADD CONSTRAINT facilities_rate_range CHECK (rate BETWEEN 100 AND 20000)""");
    }

    private void addConstraint(String name, String sql) {
        Integer exists = jdbc.queryForObject("SELECT count(*) FROM pg_constraint WHERE conname = ?", Integer.class, name);
        if (exists != null && exists == 0) {
            jdbc.execute(sql);
            log.info("Added constraint {}", name);
        }
    }
}

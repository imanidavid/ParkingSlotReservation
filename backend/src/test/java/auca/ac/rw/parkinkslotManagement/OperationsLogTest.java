package auca.ac.rw.parkinkslotManagement;

import static org.assertj.core.api.Assertions.assertThat;

import auca.ac.rw.parkinkslotManagement.ops.AuditEvent;
import auca.ac.rw.parkinkslotManagement.ops.AuditEventRepository;
import auca.ac.rw.parkinkslotManagement.ops.NotificationRecord;
import auca.ac.rw.parkinkslotManagement.ops.NotificationRecordRepository;
import auca.ac.rw.parkinkslotManagement.ops.OperationsLog;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * The MongoDB side: staff actions and sent notifications.
 *
 * <p>Skipped when nothing is listening on the Mongo port, so the suite stays
 * green on a machine without it.
 */
@SpringBootTest(properties = {"karita.audit.enabled=true", "karita.seed=false"})
@ActiveProfiles("smoke")
@EnabledIf("mongoIsReachable")
class OperationsLogTest {

    @Autowired OperationsLog ops;
    @Autowired AuditEventRepository audits;
    @Autowired NotificationRecordRepository notifications;

    static boolean mongoIsReachable() {
        String uri = System.getenv().getOrDefault("MONGO_URI", "mongodb://localhost:27017");
        String hostPort = uri.replace("mongodb://", "").split("/")[0];
        String host = hostPort.contains(":") ? hostPort.split(":")[0] : hostPort;
        int port = hostPort.contains(":") ? Integer.parseInt(hostPort.split(":")[1]) : 27017;
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, port), 1500);
            return true;
        } catch (IOException | NumberFormatException e) {
            return false;
        }
    }

    @BeforeEach
    void clean() {
        audits.deleteAll();
        notifications.deleteAll();
    }

    @Test
    void auditEventsAreStoredAndReadBackNewestFirst() {
        ops.audit(AuditEvent.SLOT_CREATED, 7L, "admin@karita.rw", "ADMIN",
                "slot:101", "Kigali Heights", Map.of("level", "B1", "slot", "A1"));
        ops.audit(AuditEvent.SLOT_DELETED, 7L, "admin@karita.rw", "ADMIN",
                "slot:101", "Kigali Heights", Map.of("level", "B1", "slot", "A1"));

        List<AuditEvent> all = ops.recentAudit(null, null, 10);
        assertThat(all).hasSize(2);
        assertThat(all.get(0).action()).isEqualTo(AuditEvent.SLOT_DELETED);
        assertThat(all.get(0).actorEmail()).isEqualTo("admin@karita.rw");
        assertThat(all.get(0).at()).isNotNull();
    }

    @Test
    void auditIsFilterableByActionAndFacility() {
        ops.audit(AuditEvent.CHECKED_IN, 3L, "attendant@karita.rw", "ATTENDANT",
                "reservation:00412", "Kigali Heights", Map.of("plate", "RAD 482 C"));
        ops.audit(AuditEvent.NO_SHOW, 3L, "attendant@karita.rw", "ATTENDANT",
                "reservation:00500", "BK Arena", Map.of("plate", "RAC 117 B"));

        assertThat(ops.recentAudit(AuditEvent.CHECKED_IN, null, 10))
                .singleElement()
                .satisfies(e -> assertThat(e.target()).isEqualTo("reservation:00412"));

        assertThat(ops.recentAudit(null, "BK Arena", 10))
                .singleElement()
                .satisfies(e -> assertThat(e.action()).isEqualTo(AuditEvent.NO_SHOW));
    }

    /**
     * The reason this collection is in MongoDB at all: a slot edit, a cash
     * payment and a release carry completely different detail fields, and all
     * three sit in one collection without a column that's null for the others.
     */
    @Test
    void detailsKeepWhateverShapeTheActionNeeds() {
        ops.audit(AuditEvent.SLOT_UPDATED, 7L, "admin@karita.rw", "ADMIN", "slot:101", "Kigali Heights",
                Map.of("level", "B2", "active", false, "fieldsSubmitted", List.of("level", "active")));
        ops.audit(AuditEvent.CASH_RECORDED, 3L, "attendant@karita.rw", "ATTENDANT",
                "reservation:00412", "Kigali Heights", Map.of("amount", 2000));

        Map<String, Object> slotEdit = ops.recentAudit(AuditEvent.SLOT_UPDATED, null, 1).get(0).details();
        assertThat(slotEdit).containsEntry("level", "B2").containsEntry("active", false);
        assertThat(slotEdit.get("fieldsSubmitted")).isInstanceOf(List.class);

        Map<String, Object> cash = ops.recentAudit(AuditEvent.CASH_RECORDED, null, 1).get(0).details();
        assertThat(cash).containsEntry("amount", 2000).doesNotContainKey("level");
    }

    @Test
    void notificationsAreQueryableByReservation() {
        ops.notified(NotificationRecord.email("e1", "reservation.confirmed", "00412",
                "driver@karita.rw", "Your parking bay is booked — 00412", "Hi Demo Driver, bay A1 is yours."));
        ops.notified(NotificationRecord.sms("e1", "reservation.confirmed", "00412",
                "driver@karita.rw", "Karita: bay A1 is booked."));
        ops.notified(NotificationRecord.email("e2", "payment.received", "00999",
                "other@karita.rw", "Payment received — 00999", "Receipt."));

        List<NotificationRecord> forBooking = ops.recentNotifications("00412", 10);
        assertThat(forBooking).hasSize(2);
        assertThat(forBooking).extracting(NotificationRecord::channel)
                .containsExactlyInAnyOrder(NotificationRecord.EMAIL, NotificationRecord.SMS);
        assertThat(forBooking).allSatisfy(n -> assertThat(n.eventId()).isEqualTo("e1"));

        assertThat(ops.recentNotifications(null, 10)).hasSize(3);
    }

    /** Email carries a subject, SMS carries a character count — one collection, two shapes. */
    @Test
    void emailAndSmsRecordsDifferWithoutSeparateCollections() {
        ops.notified(NotificationRecord.email("e3", "reservation.cancelled", "00413",
                "driver@karita.rw", "Booking cancelled — 00413", "Your booking is off."));
        ops.notified(NotificationRecord.sms("e4", "payment.received", "00414",
                "driver@karita.rw", "Karita: RWF 2,000 received."));

        List<NotificationRecord> all = ops.recentNotifications(null, 10);
        NotificationRecord email = all.stream().filter(n -> NotificationRecord.EMAIL.equals(n.channel())).findFirst().orElseThrow();
        NotificationRecord sms = all.stream().filter(n -> NotificationRecord.SMS.equals(n.channel())).findFirst().orElseThrow();

        assertThat(email.subject()).isNotBlank();
        assertThat(sms.subject()).isNull();
        assertThat(sms.characters()).isEqualTo("Karita: RWF 2,000 received.".length());
    }
}

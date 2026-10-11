package auca.ac.rw.parkinkslotManagement.ops;

import java.time.Instant;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * What was actually delivered to a driver, written by the queue consumers once
 * they've rendered a message.
 *
 * <p>The broker tells you an event was published; this says a notification went
 * out, to whom, and with what text — which is what you need when a driver says
 * they never got their ticket. Email and SMS don't carry the same fields (one
 * has a subject, the other a segment count), so a single table would be half
 * empty either way.
 */
/* Indexes are created by OpsIndexes after startup, not by annotations. */
@Document(collection = "notifications")
public record NotificationRecord(
        @Id String id,
        String eventId,
        Instant at,
        String channel,
        String routingKey,
        String serial,
        String recipient,
        String subject,
        String body,
        Integer characters) {

    public static final String EMAIL = "EMAIL";
    public static final String SMS = "SMS";

    public static NotificationRecord email(
            String eventId, String routingKey, String serial, String to, String subject, String body) {
        return new NotificationRecord(null, eventId, Instant.now(), EMAIL, routingKey, serial, to, subject, body, body.length());
    }

    public static NotificationRecord sms(String eventId, String routingKey, String serial, String to, String text) {
        return new NotificationRecord(null, eventId, Instant.now(), SMS, routingKey, serial, to, null, text, text.length());
    }
}

package auca.ac.rw.parkinkslotManagement.messaging;

import auca.ac.rw.parkinkslotManagement.ops.NotificationRecord;
import auca.ac.rw.parkinkslotManagement.ops.OperationsLog;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Consumes {@code karita.sms} — bound to only the two events worth a text
 * message. Simulated, like email; an SMS gateway would slot in here.
 *
 * <p>Kept under 160 characters, because a longer one bills as two.
 */
@Component
@ConditionalOnProperty(name = "karita.notifications.enabled", havingValue = "true", matchIfMissing = true)
public class SmsNotificationListener {

    private static final Logger log = LoggerFactory.getLogger(SmsNotificationListener.class);
    private static final int ONE_SEGMENT = 160;

    private final OperationsLog ops;

    public SmsNotificationListener(OperationsLog ops) {
        this.ops = ops;
    }

    @RabbitListener(queues = RabbitConfig.SMS_QUEUE)
    public void onEvent(KaritaEvent event) {
        String text = null;
        String eventId = null;
        if (event instanceof KaritaEvent.ReservationConfirmed e) {
            eventId = e.eventId();
            text = "Karita: bay %s (level %s) at %s is booked for %s. Ticket %s. Show this at the barrier."
                    .formatted(e.slot(), e.level(), e.facility(), e.start(), e.serial());
        } else if (event instanceof KaritaEvent.PaymentReceived e) {
            eventId = e.eventId();
            String tail = e.reference() != null && !e.reference().isBlank()
                    ? " Ref " + e.reference() + "."
                    : e.detail() != null && !e.detail().isBlank() ? " (" + e.detail() + ")" : "";
            text = "Karita: RWF %,d received by %s for ticket %s.%s"
                    .formatted(e.amount(), e.method(), e.serial(), tail);
        }
        if (text == null) return; // cancellations go by email only
        if (text.length() > ONE_SEGMENT) {
            log.warn("SMS for {} is {} chars — will bill as two segments", event.routingKey(), text.length());
        }
        log.info("SMS → {} ({} chars)\n  {}", event.email(), text.length(), text);
        ops.notified(NotificationRecord.sms(eventId, event.routingKey(), event.serial(), event.email(), text));
    }
}

package auca.ac.rw.parkinkslotManagement.messaging;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Consumes {@code karita.email}. Real delivery is out of scope (Phase 1 §3 puts
 * external gateways out of scope alongside payment processors), so this renders
 * the message it would send and logs it. Swapping in an SMTP client is a change
 * to this class only — nothing upstream knows how a notification is delivered.
 */
@Component
@ConditionalOnProperty(name = "karita.notifications.enabled", havingValue = "true", matchIfMissing = true)
public class EmailNotificationListener {

    private static final Logger log = LoggerFactory.getLogger(EmailNotificationListener.class);

    @RabbitListener(queues = RabbitConfig.EMAIL_QUEUE)
    public void onEvent(KaritaEvent event) {
        if (event instanceof KaritaEvent.ReservationConfirmed e) {
            send(e.email(), "Your parking bay is booked — " + e.serial(), """
                    Hi %s,

                    Bay %s on level %s at %s is yours.

                      When    %s to %s
                      Vehicle %s
                      Amount  RWF %,d
                      Ticket  %s

                    Show this reference at the barrier. If you no longer need the
                    bay, cancel before the start time and it goes back in the pool.
                    """
                    .formatted(e.fullName(), e.slot(), e.level(), e.facility(),
                            e.start(), e.end(), e.plate(), e.amount(), e.serial()));

        } else if (event instanceof KaritaEvent.PaymentReceived e) {
            send(e.email(), "Payment received — " + e.serial(), """
                    Hi %s,

                    We've received RWF %,d by %s for booking %s at %s.
                    %s
                    This email is your receipt.
                    """
                    .formatted(e.fullName(), e.amount(), e.method(), e.serial(), e.facility(),
                            identifier(e.reference(), e.detail())));

        } else if (event instanceof KaritaEvent.ReservationCancelled e) {
            send(e.email(), "Booking cancelled — " + e.serial(), """
                    Hi %s,

                    Booking %s at %s, due to start %s, has been cancelled and the
                    bay is available to other drivers again.
                    """
                    .formatted(e.fullName(), e.serial(), e.facility(), e.start()));
        }
    }

    /**
     * Mobile money and card payments carry a masked detail; a reference is only
     * present when the payer typed one (cash, mostly). Show whichever exists, and
     * drop the line entirely rather than print an empty label.
     */
    private static String identifier(String reference, String detail) {
        if (reference != null && !reference.isBlank()) return "\n  Reference %s\n".formatted(reference);
        if (detail != null && !detail.isBlank()) return "\n  Paid with %s\n".formatted(detail);
        return "";
    }

    private void send(String to, String subject, String body) {
        log.info("EMAIL → {}\n  Subject: {}\n{}", to, subject, body.indent(2));
    }
}

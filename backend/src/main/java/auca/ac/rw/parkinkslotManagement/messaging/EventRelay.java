package auca.ac.rw.parkinkslotManagement.messaging;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Bridges Spring's application events to the broker — and does it
 * {@code AFTER_COMMIT}, which is the whole point.
 *
 * <p>Publish inside the transaction and you can tell a driver their bay is
 * booked, then have the insert roll back on the exclusion constraint. The
 * message has already gone; you can't unsend it. Waiting for the commit means
 * nothing is ever announced that didn't actually happen.
 */
@Component
public class EventRelay {

    private final NotificationPublisher publisher;

    public EventRelay(NotificationPublisher publisher) {
        this.publisher = publisher;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void relay(KaritaEvent event) {
        publisher.publish(event);
    }
}

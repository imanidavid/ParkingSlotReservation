package auca.ac.rw.parkinkslotManagement.messaging;

/**
 * Something worth telling a driver about. Published by the services, relayed to
 * RabbitMQ after the transaction commits (see {@link EventRelay}).
 *
 * <p>Times and money are carried as preformatted strings on purpose: a message
 * crossing a broker is a contract with consumers we don't control, and a string
 * can't be read back as the wrong timezone or the wrong currency scale.
 */
public sealed interface KaritaEvent {

    /** Topic-exchange routing key; decides which queues see this event. */
    String routingKey();

    /** Who to reach. */
    String email();

    /** The reservation this is about, zero-padded. */
    String serial();

    record ReservationConfirmed(
            String eventId,
            String occurredAt,
            String serial,
            String email,
            String fullName,
            String facility,
            String level,
            String slot,
            String start,
            String end,
            String plate,
            int amount)
            implements KaritaEvent {
        @Override
        public String routingKey() {
            return "reservation.confirmed";
        }
    }

    record PaymentReceived(
            String eventId,
            String occurredAt,
            String serial,
            String email,
            String fullName,
            String facility,
            String method,
            String reference,
            String detail,
            int amount)
            implements KaritaEvent {
        @Override
        public String routingKey() {
            return "payment.received";
        }
    }

    record ReservationCancelled(
            String eventId,
            String occurredAt,
            String serial,
            String email,
            String fullName,
            String facility,
            String start)
            implements KaritaEvent {
        @Override
        public String routingKey() {
            return "reservation.cancelled";
        }
    }
}

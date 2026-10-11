package auca.ac.rw.parkinkslotManagement.messaging;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Publishes to the {@code karita.events} topic exchange. */
@Component
@ConditionalOnProperty(name = "karita.notifications.enabled", havingValue = "true", matchIfMissing = true)
public class RabbitNotificationPublisher implements NotificationPublisher {

    private static final Logger log = LoggerFactory.getLogger(RabbitNotificationPublisher.class);

    private final RabbitTemplate rabbit;

    public RabbitNotificationPublisher(RabbitTemplate rabbit) {
        this.rabbit = rabbit;
    }

    @Override
    public void publish(KaritaEvent event) {
        try {
            rabbit.convertAndSend(RabbitConfig.EXCHANGE, event.routingKey(), event);
            log.debug("Published {} to {}", event.routingKey(), RabbitConfig.EXCHANGE);
        } catch (AmqpException e) {
            // The booking is already committed and the driver has their ticket. A broker
            // that's down is a notification problem, not a reservation problem — so this
            // is logged loudly and swallowed rather than thrown back up the stack.
            log.error("Could not publish {} — notification dropped: {}", event.routingKey(), e.getMessage());
        }
    }
}

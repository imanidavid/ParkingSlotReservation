package auca.ac.rw.parkinkslotManagement.messaging;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Stand-in used when {@code karita.notifications.enabled=false} — the test
 * profile, and anywhere the app runs without a broker. Keeps the publish call
 * sites honest without requiring RabbitMQ to be up.
 */
@Component
@ConditionalOnProperty(name = "karita.notifications.enabled", havingValue = "false")
public class LoggingNotificationPublisher implements NotificationPublisher {

    private static final Logger log = LoggerFactory.getLogger(LoggingNotificationPublisher.class);

    @Override
    public void publish(KaritaEvent event) {
        log.info("[notifications off] would publish {} for {}", event.routingKey(), event.email());
    }
}

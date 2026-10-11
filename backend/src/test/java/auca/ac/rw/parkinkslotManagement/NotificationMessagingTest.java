package auca.ac.rw.parkinkslotManagement;

import static org.assertj.core.api.Assertions.assertThat;

import auca.ac.rw.parkinkslotManagement.messaging.KaritaEvent;
import auca.ac.rw.parkinkslotManagement.messaging.NotificationPublisher;
import auca.ac.rw.parkinkslotManagement.messaging.RabbitConfig;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.amqp.core.AmqpAdmin;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * Covers the broker hop itself: that an event reaches the exchange, routes by
 * its key, and survives JSON conversion both ways.
 *
 * <p>Messages are read from a throwaway queue bound alongside the real ones,
 * rather than from {@code karita.email} — the live listeners would otherwise
 * race us for them and usually win.
 *
 * <p>Skipped when nothing answers on the AMQP port, so the suite stays green on
 * a machine without RabbitMQ.
 */
@SpringBootTest(properties = {"karita.notifications.enabled=true", "karita.seed=false"})
@ActiveProfiles("smoke")
@EnabledIf("brokerIsReachable")
class NotificationMessagingTest {

    private static final long WAIT_MS = 5_000;

    @Autowired NotificationPublisher publisher;
    @Autowired RabbitTemplate rabbit;
    @Autowired AmqpAdmin admin;

    private String probeAll;
    private String probeSms;

    static boolean brokerIsReachable() {
        String host = System.getenv().getOrDefault("RABBIT_HOST", "localhost");
        int port = Integer.parseInt(System.getenv().getOrDefault("RABBIT_PORT", "5672"));
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, port), 1500);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    @BeforeEach
    void bindProbes() {
        TopicExchange exchange = new TopicExchange(RabbitConfig.EXCHANGE, true, false);
        probeAll = declare(exchange, "#");
        probeSms = declare(exchange, "reservation.confirmed", "payment.received");
    }

    @AfterEach
    void removeProbes() {
        admin.deleteQueue(probeAll);
        admin.deleteQueue(probeSms);
    }

    /** A temporary queue bound to the live exchange with the given patterns. */
    private String declare(TopicExchange exchange, String... patterns) {
        String name = "karita.test." + UUID.randomUUID();
        Queue q = QueueBuilder.nonDurable(name).autoDelete().build();
        admin.declareQueue(q);
        for (String p : patterns) {
            admin.declareBinding(BindingBuilder.bind(q).to(exchange).with(p));
        }
        return name;
    }

    @Test
    void confirmationRoundTripsThroughTheBroker() {
        KaritaEvent.ReservationConfirmed sent = new KaritaEvent.ReservationConfirmed(
                UUID.randomUUID().toString(), "2026-10-02T06:00:00Z", "00412",
                "driver@karita.rw", "Demo Driver", "Kigali Heights", "B1", "A1",
                "Fri 3 Oct, 08:00", "Fri 3 Oct, 12:00", "RAD 482 C", 2000);

        publisher.publish(sent);

        Object received = rabbit.receiveAndConvert(probeAll, WAIT_MS);
        assertThat(received).isInstanceOf(KaritaEvent.ReservationConfirmed.class);

        KaritaEvent.ReservationConfirmed got = (KaritaEvent.ReservationConfirmed) received;
        assertThat(got.serial()).isEqualTo("00412");
        assertThat(got.email()).isEqualTo("driver@karita.rw");
        assertThat(got.facility()).isEqualTo("Kigali Heights");
        assertThat(got.slot()).isEqualTo("A1");
        assertThat(got.amount()).isEqualTo(2000);
        assertThat(got.routingKey()).isEqualTo("reservation.confirmed");
    }

    @Test
    void paymentReachesBothQueues() {
        publisher.publish(new KaritaEvent.PaymentReceived(
                UUID.randomUUID().toString(), "2026-10-02T06:00:00Z", "00413",
                "driver@karita.rw", "Demo Driver", "Kigali Heights",
                "Mobile Money", "MM-7781", "+250 ••• ••• 456", 2000));

        assertThat(rabbit.receiveAndConvert(probeAll, WAIT_MS))
                .isInstanceOf(KaritaEvent.PaymentReceived.class);
        assertThat(rabbit.receiveAndConvert(probeSms, WAIT_MS))
                .isInstanceOf(KaritaEvent.PaymentReceived.class);
    }

    /** Cancellations are email-only — the SMS bindings must not pick them up. */
    @Test
    void cancellationIsRoutedAwayFromSms() {
        publisher.publish(new KaritaEvent.ReservationCancelled(
                UUID.randomUUID().toString(), "2026-10-02T06:00:00Z", "00414",
                "driver@karita.rw", "Demo Driver", "Kigali Heights", "Fri 3 Oct, 08:00"));

        assertThat(rabbit.receiveAndConvert(probeAll, WAIT_MS))
                .isInstanceOf(KaritaEvent.ReservationCancelled.class);
        assertThat(rabbit.receiveAndConvert(probeSms, 1_000)).isNull();
    }

    /** The queues and exchange the app declares on startup really exist. */
    @Test
    void topologyIsDeclared() {
        assertThat(admin.getQueueProperties(RabbitConfig.EMAIL_QUEUE)).isNotNull();
        assertThat(admin.getQueueProperties(RabbitConfig.SMS_QUEUE)).isNotNull();
        assertThat(admin.getQueueProperties(RabbitConfig.DEAD_LETTER_QUEUE)).isNotNull();
    }
}

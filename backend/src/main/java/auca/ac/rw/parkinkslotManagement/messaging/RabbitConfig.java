package auca.ac.rw.parkinkslotManagement.messaging;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.FanoutExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.JacksonJsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Topology for notification events.
 *
 * <pre>
 *                        ┌─ karita.email  ← reservation.#, payment.#
 *   karita.events ──────┤
 *   (topic)              └─ karita.sms    ← reservation.confirmed, payment.received
 *
 *   on repeated failure ─→ karita.events.dlx ─→ karita.dead-letter
 * </pre>
 *
 * Both queues are durable, so a broker restart doesn't lose a pending message,
 * and both dead-letter rather than redeliver forever — a message that can't be
 * handled parks somewhere visible instead of spinning.
 */
@Configuration
@ConditionalOnProperty(name = "karita.notifications.enabled", havingValue = "true", matchIfMissing = true)
public class RabbitConfig {

    public static final String EXCHANGE = "karita.events";
    public static final String DLX = "karita.events.dlx";
    public static final String EMAIL_QUEUE = "karita.email";
    public static final String SMS_QUEUE = "karita.sms";
    public static final String DEAD_LETTER_QUEUE = "karita.dead-letter";

    /** Only package whose classes may be deserialised from a message. */
    private static final String EVENT_PACKAGE = "auca.ac.rw.parkinkslotManagement.messaging";

    @Bean
    public TopicExchange karitaEvents() {
        return new TopicExchange(EXCHANGE, true, false);
    }

    @Bean
    public FanoutExchange karitaDeadLetterExchange() {
        return new FanoutExchange(DLX, true, false);
    }

    @Bean
    public Queue deadLetterQueue() {
        return QueueBuilder.durable(DEAD_LETTER_QUEUE).build();
    }

    @Bean
    public Binding deadLetterBinding() {
        return BindingBuilder.bind(deadLetterQueue()).to(karitaDeadLetterExchange());
    }

    @Bean
    public Queue emailQueue() {
        return QueueBuilder.durable(EMAIL_QUEUE).deadLetterExchange(DLX).build();
    }

    @Bean
    public Queue smsQueue() {
        return QueueBuilder.durable(SMS_QUEUE).deadLetterExchange(DLX).build();
    }

    /** Email hears about everything. */
    @Bean
    public Binding emailReservations() {
        return BindingBuilder.bind(emailQueue()).to(karitaEvents()).with("reservation.#");
    }

    @Bean
    public Binding emailPayments() {
        return BindingBuilder.bind(emailQueue()).to(karitaEvents()).with("payment.#");
    }

    /** SMS is for the two things worth interrupting someone's day over. */
    @Bean
    public Binding smsConfirmed() {
        return BindingBuilder.bind(smsQueue()).to(karitaEvents()).with("reservation.confirmed");
    }

    @Bean
    public Binding smsPaid() {
        return BindingBuilder.bind(smsQueue()).to(karitaEvents()).with("payment.received");
    }

    /**
     * Jackson 3 converter — spring-amqp 4 dropped the Jackson 2 one.
     *
     * <p>The constructor argument is the deserialisation allow-list. Spring AMQP
     * refuses to instantiate a type named in a message header unless its package
     * is listed, which stops a message from naming an arbitrary class and having
     * it constructed on our side. Our own event package is all it needs; the
     * wildcard "*" would hand that decision back to whoever can reach the queue.
     */
    @Bean
    public MessageConverter jsonMessageConverter() {
        return new JacksonJsonMessageConverter(EVENT_PACKAGE);
    }

    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory factory, MessageConverter converter) {
        RabbitTemplate template = new RabbitTemplate(factory);
        template.setMessageConverter(converter);
        template.setExchange(EXCHANGE);
        return template;
    }
}

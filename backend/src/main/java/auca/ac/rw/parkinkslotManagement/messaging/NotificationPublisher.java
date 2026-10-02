package auca.ac.rw.parkinkslotManagement.messaging;

/** Where a {@link KaritaEvent} goes once its transaction has committed. */
public interface NotificationPublisher {
    void publish(KaritaEvent event);
}

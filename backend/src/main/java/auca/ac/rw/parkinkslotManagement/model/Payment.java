package auca.ac.rw.parkinkslotManagement.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** The payment record of a reservation (one each). */
@Entity
@Table(name = "payments")
@Getter
@Setter
@NoArgsConstructor
public class Payment {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "payment_seq")
    @SequenceGenerator(name = "payment_seq", sequenceName = "payment_seq", allocationSize = 50)
    @Column(name = "payment_id")
    private Long paymentId;

    @NotNull
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reservation_id", nullable = false, unique = true)
    private Reservation reservation;

    /** RWF; mirrors the reservation amount when recorded. */
    @Column(nullable = false)
    private int amount;

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private PaymentMethod method;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private PaymentStatus status = PaymentStatus.PENDING;

    /** The driver's own note. */
    @Column(nullable = false, length = 80)
    private String reference = "";

    /** Masked payer detail, e.g. "•••• 4242" or "+250 ••• ••• 456". */
    @Column(nullable = false, length = 40)
    private String detail = "";

    @Column(name = "paid_at")
    private Instant paidAt;
}

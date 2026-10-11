package auca.ac.rw.parkinkslotManagement.model;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

/**
 * A booking of one slot for a time window. Overlapping CONFIRMED bookings of
 * the same slot are rejected by the database (see SchemaInitializer).
 */
@Entity
@Table(
        name = "reservations",
        indexes = {
            @Index(name = "ix_res_facility_start", columnList = "facility_id, start_time"),
            @Index(name = "ix_res_user", columnList = "user_id"),
            @Index(name = "ix_res_slot", columnList = "slot_id")
        })
@Getter
@Setter
@NoArgsConstructor
public class Reservation {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "reservation_seq")
    @SequenceGenerator(name = "reservation_seq", sequenceName = "reservation_seq", initialValue = 407, allocationSize = 50)
    @Column(name = "reservation_id")
    private Long reservationId;

    @NotNull
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @NotNull
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "facility_id", nullable = false)
    private Facility facility;

    /** Null once an admin deletes the slot; the snapshot fields keep history readable. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "slot_id")
    @OnDelete(action = OnDeleteAction.SET_NULL)
    private ParkingSlot slot;

    @NotBlank
    @Column(name = "slot_level", nullable = false, length = 3)
    private String slotLevel;

    @NotBlank
    @Column(name = "slot_number", nullable = false, length = 5)
    private String slotNumber;

    @NotBlank
    @Column(name = "vehicle_plate", nullable = false, length = 12)
    private String vehiclePlate;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "vehicle_type", nullable = false, length = 12)
    private VehicleType vehicleType;

    @NotNull
    @Column(name = "start_time", nullable = false)
    private LocalDateTime startTime;

    @NotNull
    @Column(name = "end_time", nullable = false)
    private LocalDateTime endTime;

    /** When the slot stops being held: the end time, or when the car left. */
    @NotNull
    @Column(name = "hold_until", nullable = false)
    private LocalDateTime holdUntil;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    private ReservationStatus status = ReservationStatus.CONFIRMED;

    /** RWF. */
    @Column(nullable = false)
    private int amount;

    @Column(name = "checked_in_at")
    private Instant checkedInAt;

    @Column(name = "released_at")
    private Instant releasedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @OneToOne(mappedBy = "reservation", cascade = CascadeType.ALL, fetch = FetchType.LAZY, optional = false)
    private Payment payment;

    public String serial() {
        return String.format("%05d", reservationId);
    }

    public void attachPayment(Payment p) {
        this.payment = p;
        p.setReservation(this);
    }
}

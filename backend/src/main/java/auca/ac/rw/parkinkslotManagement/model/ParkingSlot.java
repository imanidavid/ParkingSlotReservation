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
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** One parking bay, e.g. level B1, slot A12, for cars. */
@Entity
@Table(
        name = "parking_slots",
        uniqueConstraints = @UniqueConstraint(name = "uk_slot_number", columnNames = {"facility_id", "level", "slot_number"}))
@Getter
@Setter
@NoArgsConstructor
public class ParkingSlot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "slot_id")
    private Long slotId;

    @NotNull
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "facility_id", nullable = false)
    private Facility facility;

    @NotBlank
    @Pattern(regexp = "[A-Z0-9]{1,3}")
    @Column(nullable = false, length = 3)
    private String level;

    /** Row letter(s) then a number, e.g. "A12". */
    @NotBlank
    @Pattern(regexp = "[A-Z]{1,2}\\d{1,3}")
    @Column(name = "slot_number", nullable = false, length = 5)
    private String slotNumber;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "vehicle_type", nullable = false, length = 12)
    private VehicleType vehicleType;

    /** False = out of service: shown, but can't be booked. */
    @Column(nullable = false)
    private boolean active = true;

    public ParkingSlot(Facility facility, String level, String slotNumber, VehicleType vehicleType) {
        this.facility = facility;
        this.level = level;
        this.slotNumber = slotNumber;
        this.vehicleType = vehicleType;
    }
}

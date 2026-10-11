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
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "user_id")
    private Long userId;

    @NotBlank
    @Size(min = 2, max = 80)
    @Column(name = "full_name", nullable = false, length = 80)
    private String fullName;

    @NotBlank
    @Email
    @Size(max = 120)
    @Column(nullable = false, unique = true, length = 120)
    private String email;

    /** PBKDF2 hash, see PasswordHasher. */
    @NotBlank
    @Column(name = "password_hash", nullable = false, length = 200)
    private String passwordHash;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    private Role role;

    /** Default plate and vehicle, prefilled when booking (drivers). */
    @Column(length = 12)
    private String plate;

    @Enumerated(EnumType.STRING)
    @Column(name = "vehicle_type", length = 12)
    private VehicleType vehicleType;

    /** Attendants only: the facility they work at. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assigned_facility_id")
    private Facility assignedFacility;
}

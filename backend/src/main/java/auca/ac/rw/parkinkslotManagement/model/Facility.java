package auca.ac.rw.parkinkslotManagement.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Arrays;
import java.util.List;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A parking location with one or more levels of slots. */
@Entity
@Table(name = "facilities")
@Getter
@Setter
@NoArgsConstructor
public class Facility {

    public static final List<String> TYPES = List.of("Campus", "Office", "Mall", "Public");

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "facility_id")
    private Long facilityId;

    /** URL-safe id used by the API and pages, e.g. "kigali-heights". */
    @NotBlank
    @Column(nullable = false, unique = true, length = 60)
    private String code;

    @NotBlank
    @Size(min = 2, max = 80)
    @Column(nullable = false, unique = true, length = 80)
    private String name;

    @NotBlank
    @Size(min = 2, max = 120)
    @Column(nullable = false, length = 120)
    private String address;

    @NotBlank
    @Size(min = 2, max = 60)
    @Column(nullable = false, length = 60)
    private String city;

    @NotBlank
    @Pattern(regexp = "Campus|Office|Mall|Public")
    @Column(nullable = false, length = 20)
    private String type;

    /** RWF per hour. */
    @Min(100)
    @Max(20000)
    @Column(nullable = false)
    private int rate;

    /** Comma-separated level names in display order, e.g. "B1,B2". */
    @NotBlank
    @Pattern(regexp = "[A-Z0-9]{1,3}(,[A-Z0-9]{1,3}){0,7}")
    @Column(nullable = false, length = 40)
    private String levels;

    @Column(nullable = false)
    private boolean active = true;

    public List<String> levelList() {
        return Arrays.stream(levels.split(",")).filter(s -> !s.isBlank()).toList();
    }

    public void setLevelList(List<String> list) {
        this.levels = String.join(",", list);
    }
}

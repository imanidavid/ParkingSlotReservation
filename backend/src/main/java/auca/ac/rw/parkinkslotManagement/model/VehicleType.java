package auca.ac.rw.parkinkslotManagement.model;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

/** Bay and vehicle sizes. A vehicle fits a bay of its own size or larger. */
public enum VehicleType {
    MOTORCYCLE("Motorcycle", 1),
    CAR("Car", 2),
    SUV("SUV", 3),
    TRUCK("Truck", 4);

    private final String label;
    private final int size;

    VehicleType(String label, int size) {
        this.label = label;
        this.size = size;
    }

    public String label() {
        return label;
    }

    public boolean fits(VehicleType vehicle) {
        return vehicle != null && size >= vehicle.size;
    }

    public static Optional<VehicleType> fromLabel(String value) {
        return Arrays.stream(values()).filter(v -> v.label.equals(value)).findFirst();
    }

    public static List<String> labels() {
        return Arrays.stream(values()).map(VehicleType::label).toList();
    }
}

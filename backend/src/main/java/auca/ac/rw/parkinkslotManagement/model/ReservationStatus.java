package auca.ac.rw.parkinkslotManagement.model;

public enum ReservationStatus {
    CONFIRMED("Confirmed"),
    CANCELLED("Cancelled"),
    NO_SHOW("No-show");

    private final String label;

    ReservationStatus(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}

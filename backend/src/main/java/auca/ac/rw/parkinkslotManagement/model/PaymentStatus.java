package auca.ac.rw.parkinkslotManagement.model;

public enum PaymentStatus {
    PENDING("Pending"),
    PAID("Paid"),
    FAILED("Failed");

    private final String label;

    PaymentStatus(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}

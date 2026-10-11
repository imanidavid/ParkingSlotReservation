package auca.ac.rw.parkinkslotManagement.model;

import java.util.Arrays;
import java.util.Optional;

public enum PaymentMethod {
    CASH("Cash"),
    MOBILE_MONEY("Mobile Money"),
    CARD("Card");

    private final String label;

    PaymentMethod(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    public static Optional<PaymentMethod> fromLabel(String value) {
        return Arrays.stream(values()).filter(m -> m.label.equals(value)).findFirst();
    }
}

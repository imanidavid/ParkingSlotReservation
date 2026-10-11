package auca.ac.rw.parkinkslotManagement.model;

public enum Role {
    USER("home.html"),
    ATTENDANT("attendant.html"),
    ADMIN("admin.html");

    private final String home;

    Role(String home) {
        this.home = home;
    }

    /** Page this role lands on after sign-in. */
    public String home() {
        return home;
    }

    /** JSON form: "user", "attendant", "admin". */
    public String json() {
        return name().toLowerCase();
    }
}

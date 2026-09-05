package rw.ac.auca.parking.model;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.Table;

@Entity
@Table(name = "parking_slots")
public class ParkingSlot {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "slot_id")
    private Long slotId;

    @Column(name = "slot_number", nullable = false, length = 20)
    private String slotNumber;

    @Column(nullable = false, length = 100)
    private String location;

    @Column(name = "vehicle_type", nullable = false, length = 20)
    private String vehicleType;

    @Column(nullable = false, length = 20)
    private String status;

    public ParkingSlot() {
    }

    public ParkingSlot(Long slotId, String slotNumber, String location, String vehicleType, String status) {
        this.slotId = slotId;
        this.slotNumber = slotNumber;
        this.location = location;
        this.vehicleType = vehicleType;
        this.status = status;
    }

    public Long getSlotId() {
        return slotId;
    }

    public void setSlotId(Long slotId) {
        this.slotId = slotId;
    }

    public String getSlotNumber() {
        return slotNumber;
    }

    public void setSlotNumber(String slotNumber) {
        this.slotNumber = slotNumber;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public String getVehicleType() {
        return vehicleType;
    }

    public void setVehicleType(String vehicleType) {
        this.vehicleType = vehicleType;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }
}
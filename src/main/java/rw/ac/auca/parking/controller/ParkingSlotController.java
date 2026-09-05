package rw.ac.auca.parking.controller;

import rw.ac.auca.parking.dao.ParkingSlotDao;
import rw.ac.auca.parking.dao.ReservationDao;
import rw.ac.auca.parking.model.ParkingSlot;
import rw.ac.auca.parking.model.Reservation;
import rw.ac.auca.parking.model.User;

import javax.faces.bean.ManagedBean;
import javax.faces.bean.SessionScoped;
import java.util.Date;
import java.util.List;

@ManagedBean
@SessionScoped
public class ParkingSlotController {
    private ParkingSlotDao parkingSlotDao = new ParkingSlotDao();
    private ParkingSlot newSlot = new ParkingSlot();
    private ParkingSlot updateSlot = new ParkingSlot();
    private String[] statusOptions = {"Available", "Reserved", "Occupied"};

    // Create - add new parking slot
    public String addSlot() {
        parkingSlotDao.addParkingSlot(newSlot);
        newSlot = new ParkingSlot();
        return "admin-slots?faces-redirect=true";
    }

    // Read - get all slots
    public List<ParkingSlot> getAllSlots() {
        return parkingSlotDao.getAllSlots();
    }

    // Read - get available slots
    public List<ParkingSlot> getAvailableSlots() {
        return parkingSlotDao.getAvailableSlots();
    }

    // Update - modify slot
    public String updateSlot() {
        parkingSlotDao.updateParkingSlot(updateSlot);
        updateSlot = new ParkingSlot();
        return "admin-slots?faces-redirect=true";
    }

    // Delete - remove slot
    public String prepareUpdate(Long slotId) {
        ParkingSlot slot = parkingSlotDao.getAllSlots().stream()
                .filter(s -> s.getSlotId().equals(slotId))
                .findFirst()
                .orElse(new ParkingSlot());
        this.updateSlot = slot;
        return "admin-slots?faces-redirect=true";
    }

    // Getters and setters
    public ParkingSlot getNewSlot() {
        return newSlot;
    }

    public void setNewSlot(ParkingSlot newSlot) {
        this.newSlot = newSlot;
    }

    public ParkingSlot getUpdateSlot() {
        return updateSlot;
    }

    public void setUpdateSlot(ParkingSlot updateSlot) {
        this.updateSlot = updateSlot;
    }

    public String[] getStatusOptions() {
        return statusOptions;
    }

    public void setStatusOptions(String[] statusOptions) {
        this.statusOptions = statusOptions;
    }

    // Delete - remove slot
    public void deleteSlot(Long slotId) {
        parkingSlotDao.deleteParkingSlot(slotId);
    }
}
package rw.ac.auca.parking.controller;

import rw.ac.auca.parking.dao.ParkingSlotDao;
import rw.ac.auca.parking.dao.ReservationDao;
import rw.ac.auca.parking.model.ParkingSlot;
import rw.ac.auca.parking.model.Reservation;
import rw.ac.auca.parking.model.User;

import javax.faces.application.FacesMessage;
import javax.faces.bean.ManagedBean;
import javax.faces.bean.SessionScoped;
import javax.faces.context.FacesContext;
import javax.faces.model.SelectItem;
import java.util.Date;
import java.util.List;

@ManagedBean
@SessionScoped
public class ReservationController {
    private ReservationDao reservationDao = new ReservationDao();
    private ParkingSlotDao parkingSlotDao = new ParkingSlotDao();
    private Reservation newReservation = new Reservation();
    private Reservation updateReservation = new Reservation();
    private Reservation lastReservation;
    private ParkingSlot slot = new ParkingSlot();
    private String[] reservationStatusOptions = {"Confirmed", "Pending", "Cancelled"};

    public ReservationController() {
        this.newReservation.setSlot(new ParkingSlot());
    }

    // Create - reserve a slot
    public String reserveSlot() {
        User currentUser = getCurrentUser();
        if (currentUser == null || currentUser.getUserId() == null || currentUser.getUserId() == 0L) {
            FacesContext.getCurrentInstance().addMessage(null,
                    new FacesMessage(FacesMessage.SEVERITY_ERROR,
                            "Please register or login before reserving a slot.", null));
            return null;
        }
        newReservation.setUser(currentUser);

        ParkingSlot selectedSlot = newReservation.getSlot();
        Date startTime = newReservation.getStartTime();
        Date endTime = newReservation.getEndTime();

        if (selectedSlot != null && selectedSlot.getSlotId() != null
                && startTime != null && endTime != null) {
            // Load the persisted slot so Hibernate can bind a managed entity
            ParkingSlot managedSlot = parkingSlotDao.getParkingSlotById(selectedSlot.getSlotId());
            if (managedSlot == null) {
                FacesContext.getCurrentInstance().addMessage(null,
                        new FacesMessage(FacesMessage.SEVERITY_ERROR,
                                "Selected slot no longer exists.", null));
                return null;
            }
            newReservation.setSlot(managedSlot);

            boolean available = reservationDao.isSlotAvailable(managedSlot, startTime, endTime);
            if (available) {
                newReservation.setStatus("Confirmed");
                reservationDao.createReservation(newReservation);
                this.lastReservation = newReservation;
                newReservation = new Reservation();
                newReservation.setSlot(new ParkingSlot());
                return "confirmation?faces-redirect=true";
            } else {
                FacesContext.getCurrentInstance().addMessage(null,
                        new FacesMessage(FacesMessage.SEVERITY_WARN,
                                "Slot is not available for the selected time range.", null));
                return null;
            }
        }
        FacesContext.getCurrentInstance().addMessage(null,
                new FacesMessage(FacesMessage.SEVERITY_ERROR,
                        "Please select a slot and enter both start and end times.", null));
        return null;
    }

    private User getCurrentUser() {
        FacesContext context = FacesContext.getCurrentInstance();
        UserController userController = (UserController) context.getExternalContext()
                .getSessionMap().get("userController");
        if (userController == null) {
            return new User();
        }
        return userController.getCurrentUser();
    }

    // Read - get available slots for reservation dropdown
    public List<SelectItem> getAvailableSlots() {
        List<ParkingSlot> slots = parkingSlotDao.getAvailableSlots();
        List<SelectItem> selectItems = new java.util.ArrayList<>();
        for (ParkingSlot s : slots) {
            selectItems.add(new SelectItem(s.getSlotId(), s.getSlotNumber()));
        }
        return selectItems;
    }
    public List<Reservation> getAllReservations() {
        return reservationDao.getAllReservations();
    }

    // Read - get reservations by user
    public List<Reservation> getReservationsByUser(User user) {
        return reservationDao.getReservationsByUser(user);
    }

    // Update - modify reservation
    public String prepareUpdateReservation(Long reservationId) {
        if (reservationId == null) {
            return "user-dashboard?faces-redirect=true";
        }
        Reservation reservation = reservationDao.getReservationById(reservationId);
        if (reservation != null) {
            this.updateReservation = reservation;
        }
        return "user-dashboard?faces-redirect=true";
    }

    public String updateReservation() {
        if (updateReservation == null || updateReservation.getReservationId() == null) {
            FacesContext.getCurrentInstance().addMessage(null,
                    new FacesMessage(FacesMessage.SEVERITY_WARN,
                            "No reservation selected for rescheduling.", null));
            return null;
        }
        Date startTime = updateReservation.getStartTime();
        Date endTime = updateReservation.getEndTime();
        if (startTime == null || endTime == null || !endTime.after(startTime)) {
            FacesContext.getCurrentInstance().addMessage(null,
                    new FacesMessage(FacesMessage.SEVERITY_WARN,
                            "End time must be after start time.", null));
            return null;
        }
        Long slotId = updateReservation.getSlot() == null ? null : updateReservation.getSlot().getSlotId();
        ParkingSlot managedSlot = slotId == null ? null : parkingSlotDao.getParkingSlotById(slotId);
        if (managedSlot == null) {
            FacesContext.getCurrentInstance().addMessage(null,
                    new FacesMessage(FacesMessage.SEVERITY_WARN,
                            "Selected slot no longer exists.", null));
            return null;
        }
        updateReservation.setSlot(managedSlot);
        boolean available = reservationDao.isSlotAvailable(managedSlot, startTime, endTime,
                updateReservation.getReservationId());
        if (!available) {
            FacesContext.getCurrentInstance().addMessage(null,
                    new FacesMessage(FacesMessage.SEVERITY_WARN,
                            "Slot is not available during the selected time range.", null));
            return null;
        }
        updateReservation.setStatus("Confirmed");
        reservationDao.updateReservation(updateReservation);
        updateReservation = new Reservation();
        FacesContext.getCurrentInstance().getExternalContext().getFlash().setKeepMessages(true);
        FacesContext.getCurrentInstance().addMessage(null,
                new FacesMessage(FacesMessage.SEVERITY_INFO,
                        "Reservation updated successfully.", null));
        return "user-dashboard?faces-redirect=true";
    }

    // Delete - cancel reservation
    public void cancelReservation(Long reservationId) {
        reservationDao.deleteReservation(reservationId);
    }

    // Getters and setters
    public Reservation getNewReservation() {
        return newReservation;
    }

    public void setNewReservation(Reservation newReservation) {
        this.newReservation = newReservation;
    }

    public Reservation getUpdateReservation() {
        return updateReservation;
    }

    public void setUpdateReservation(Reservation updateReservation) {
        this.updateReservation = updateReservation;
    }

    public Reservation getLastReservation() {
        return lastReservation;
    }

    public void setLastReservation(Reservation lastReservation) {
        this.lastReservation = lastReservation;
    }

    public ParkingSlot getSlot() {
        return slot;
    }

    public void setSlot(ParkingSlot slot) {
        this.slot = slot;
    }

    public String[] getReservationStatusOptions() {
        return reservationStatusOptions;
    }

    public void setReservationStatusOptions(String[] reservationStatusOptions) {
        this.reservationStatusOptions = reservationStatusOptions;
    }
}
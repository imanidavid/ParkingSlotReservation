package rw.ac.auca.parking.dao;

import org.hibernate.Session;
import org.hibernate.Transaction;
import rw.ac.auca.parking.model.ParkingSlot;
import rw.ac.auca.parking.model.Reservation;
import rw.ac.auca.parking.model.User;

import java.util.List;

/**
 * The Class ParkingSlotDao.
 *
 * @author Imani First
 * @version 1.0
 */
public class ParkingSlotDao {

    HibernateUtil hibernateUtil = new HibernateUtil();

    // Create
    public ParkingSlot addParkingSlot(ParkingSlot theParkingSlot){
        Session ss = hibernateUtil.getSessionFactory().openSession();
        Transaction tr = ss.beginTransaction();
        ss.save(theParkingSlot);
        tr.commit();
        ss.close();
        return theParkingSlot;
    }

    // Read - get all slots
    public List<ParkingSlot> getAllSlots(){
        Session ss = hibernateUtil.getSessionFactory().openSession();
        List<ParkingSlot> slots = ss
                .createQuery("from ParkingSlot").list();
        ss.close();
        return slots;
    }

    // Read - get available slots
    public List<ParkingSlot> getAvailableSlots(){
        Session ss = hibernateUtil.getSessionFactory().openSession();
        List<ParkingSlot> slots = ss
                .createQuery("from ParkingSlot where status = 'Available'").list();
        ss.close();
        return slots;
    }

    // Read - get slot by id
    public ParkingSlot getParkingSlotById(Long slotId){
        Session ss = hibernateUtil.getSessionFactory().openSession();
        ParkingSlot slot = ss.get(ParkingSlot.class, slotId);
        ss.close();
        return slot;
    }

    // Update
    public ParkingSlot updateParkingSlot(ParkingSlot theParkingSlot){
        Session ss = hibernateUtil.getSessionFactory().openSession();
        Transaction tr = ss.beginTransaction();
        ss.update(theParkingSlot);
        tr.commit();
        ss.close();
        return theParkingSlot;
    }

    // Delete
    public void deleteParkingSlot(Long slotId){
        Session ss = hibernateUtil.getSessionFactory().openSession();
        Transaction tr = ss.beginTransaction();
        ParkingSlot slot = ss.get(ParkingSlot.class, slotId);
        if (slot != null) {
            ss.delete(slot);
        }
        tr.commit();
        ss.close();
    }
}
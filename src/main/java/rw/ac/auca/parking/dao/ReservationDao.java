package rw.ac.auca.parking.dao;

import org.hibernate.Session;
import org.hibernate.Transaction;
import org.hibernate.query.Query;
import rw.ac.auca.parking.model.ParkingSlot;
import rw.ac.auca.parking.model.Reservation;
import rw.ac.auca.parking.model.User;

import java.util.ArrayList;
import java.util.List;

/**
 * The Class ReservationDao.
 *
 * @author Imani First
 * @version 1.0
 */
public class ReservationDao {

    HibernateUtil hibernateUtil = new HibernateUtil();

    // Create
    public Reservation createReservation(Reservation theReservation){
        Session ss = hibernateUtil.getSessionFactory().openSession();
        Transaction tr = ss.beginTransaction();
        ss.save(theReservation);
        tr.commit();
        ss.close();
        return theReservation;
    }

    // Read - get all reservations
    public List<Reservation> getAllReservations(){
        Session ss = hibernateUtil.getSessionFactory().openSession();
        List<Reservation> reservations = ss
                .createQuery("from Reservation").list();
        ss.close();
        return reservations;
    }

    // Read - get a single reservation by id
    public Reservation getReservationById(Long reservationId){
        Session ss = hibernateUtil.getSessionFactory().openSession();
        Reservation reservation = ss.get(Reservation.class, reservationId);
        ss.close();
        return reservation;
    }

    // Read - get reservations by user
    public List<Reservation> getReservationsByUser(User user){
        if (user == null || user.getUserId() == null || user.getUserId() == 0L) {
            return new ArrayList<>();
        }
        Session ss = hibernateUtil.getSessionFactory().openSession();
        List<Reservation> reservations = ss
                .createQuery("from Reservation where user = :user")
                .setParameter("user", user)
                .list();
        ss.close();
        return reservations;
    }

    // Update
    public Reservation updateReservation(Reservation theReservation){
        Session ss = hibernateUtil.getSessionFactory().openSession();
        Transaction tr = ss.beginTransaction();
        ss.update(theReservation);
        tr.commit();
        ss.close();
        return theReservation;
    }

    // Delete
    public void deleteReservation(Long reservationId){
        Session ss = hibernateUtil.getSessionFactory().openSession();
        Transaction tr = ss.beginTransaction();
        Reservation reservation = ss.get(Reservation.class, reservationId);
        if (reservation != null) {
            ss.delete(reservation);
        }
        tr.commit();
        ss.close();
    }

    // Check for conflicts
    public boolean isSlotAvailable(ParkingSlot slot, java.util.Date startTime, java.util.Date endTime){
        return isSlotAvailable(slot, startTime, endTime, null);
    }

    // Check for conflicts, optionally excluding one reservation (e.g. the one being rescheduled)
    public boolean isSlotAvailable(ParkingSlot slot, java.util.Date startTime, java.util.Date endTime,
                                   Long excludeReservationId){
        Session ss = hibernateUtil.getSessionFactory().openSession();
        Query query = ss.createQuery(
                "from Reservation where slot = :slot and " +
                "((startTime <= :endTime) and (endTime >= :startTime))" +
                (excludeReservationId == null ? "" : " and reservationId != :excludeId"));
        query.setParameter("slot", slot);
        query.setParameter("startTime", startTime);
        query.setParameter("endTime", endTime);
        if (excludeReservationId != null) {
            query.setParameter("excludeId", excludeReservationId);
        }
        boolean available = query.list().isEmpty();
        ss.close();
        return available;
    }
}
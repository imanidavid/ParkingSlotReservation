package auca.ac.rw.parkinkslotManagement.repository;

import auca.ac.rw.parkinkslotManagement.model.Facility;
import auca.ac.rw.parkinkslotManagement.model.ParkingSlot;
import auca.ac.rw.parkinkslotManagement.model.Reservation;
import auca.ac.rw.parkinkslotManagement.model.User;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReservationRepository extends JpaRepository<Reservation, Long> {

    /** Confirmed bookings that hold a slot at some point in [from, to). */
    @Query("""
            select r from Reservation r
            where r.status = auca.ac.rw.parkinkslotManagement.model.ReservationStatus.CONFIRMED
              and r.slot is not null
              and r.startTime < :to and r.holdUntil > :from
            """)
    List<Reservation> findHolding(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Query("""
            select r from Reservation r
            where r.status = auca.ac.rw.parkinkslotManagement.model.ReservationStatus.CONFIRMED
              and r.facility = :facility and r.slot is not null
              and r.startTime < :to and r.holdUntil > :from
            """)
    List<Reservation> findHoldingAt(
            @Param("facility") Facility facility, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    /** Is the slot held by another confirmed booking in [from, to)? */
    @Query("""
            select count(r) > 0 from Reservation r
            where r.status = auca.ac.rw.parkinkslotManagement.model.ReservationStatus.CONFIRMED
              and r.slot = :slot
              and r.startTime < :to and r.holdUntil > :from
              and (:exceptId is null or r.reservationId <> :exceptId)
            """)
    boolean isHeld(
            @Param("slot") ParkingSlot slot,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to,
            @Param("exceptId") Long exceptId);

    @Query("""
            select r from Reservation r join fetch r.facility left join fetch r.slot join fetch r.payment
            where r.user = :user order by r.startTime
            """)
    List<Reservation> findByUserWithDetails(@Param("user") User user);

    @Query("""
            select r from Reservation r join fetch r.facility left join fetch r.slot join fetch r.payment join fetch r.user
            where r.facility = :facility and r.startTime >= :from and r.startTime < :to
            order by r.startTime
            """)
    List<Reservation> findAtFacilityStarting(
            @Param("facility") Facility facility, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    /** Admin list; null filters are ignored. */
    @Query("""
            select r from Reservation r join fetch r.facility left join fetch r.slot join fetch r.payment join fetch r.user
            where (:facility is null or r.facility = :facility)
              and r.startTime >= :from and r.startTime < :to
            order by r.startTime desc
            """)
    List<Reservation> findForAdmin(
            @Param("facility") Facility facility, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    @Query("""
            select r from Reservation r join fetch r.payment
            where r.startTime >= :from or (r.status = auca.ac.rw.parkinkslotManagement.model.ReservationStatus.CONFIRMED and r.holdUntil > :now)
            """)
    List<Reservation> findForRevenue(@Param("from") LocalDateTime from, @Param("now") LocalDateTime now);

    boolean existsByFacility(Facility facility);

    @Query("""
            select count(r) from Reservation r
            where r.status = auca.ac.rw.parkinkslotManagement.model.ReservationStatus.CONFIRMED
              and r.slot = :slot and r.holdUntil > :now
            """)
    long countUpcomingAtSlot(@Param("slot") ParkingSlot slot, @Param("now") LocalDateTime now);

    @Query("""
            select r from Reservation r
            where r.status = auca.ac.rw.parkinkslotManagement.model.ReservationStatus.CONFIRMED
              and r.slot = :slot and r.holdUntil > :now
            """)
    List<Reservation> findUpcomingAtSlot(@Param("slot") ParkingSlot slot, @Param("now") LocalDateTime now);

    @Query("""
            select count(r) from Reservation r
            where r.status = auca.ac.rw.parkinkslotManagement.model.ReservationStatus.CONFIRMED
              and r.facility = :facility and r.holdUntil > :now
            """)
    long countUpcomingAtFacility(@Param("facility") Facility facility, @Param("now") LocalDateTime now);

    @Query("""
            select r.slot.slotId, count(r) from Reservation r
            where r.status = auca.ac.rw.parkinkslotManagement.model.ReservationStatus.CONFIRMED
              and r.facility = :facility and r.slot is not null and r.holdUntil > :now
            group by r.slot.slotId
            """)
    List<Object[]> countUpcomingBySlot(@Param("facility") Facility facility, @Param("now") LocalDateTime now);

    @Query("""
            select r.facility.facilityId, count(r) from Reservation r
            where r.status = auca.ac.rw.parkinkslotManagement.model.ReservationStatus.CONFIRMED and r.holdUntil > :now
            group by r.facility.facilityId
            """)
    List<Object[]> countUpcomingByFacility(@Param("now") LocalDateTime now);
}

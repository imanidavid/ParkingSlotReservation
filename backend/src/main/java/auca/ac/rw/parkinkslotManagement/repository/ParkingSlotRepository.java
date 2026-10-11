package auca.ac.rw.parkinkslotManagement.repository;

import auca.ac.rw.parkinkslotManagement.model.Facility;
import auca.ac.rw.parkinkslotManagement.model.ParkingSlot;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ParkingSlotRepository extends JpaRepository<ParkingSlot, Long> {

    List<ParkingSlot> findByFacility(Facility facility);

    List<ParkingSlot> findByFacilityAndLevel(Facility facility, String level);

    Optional<ParkingSlot> findByFacilityAndLevelAndSlotNumber(Facility facility, String level, String slotNumber);

    boolean existsByFacilityAndLevel(Facility facility, String level);

    @Query("select s from ParkingSlot s join fetch s.facility f where f.active = true")
    List<ParkingSlot> findAllInActiveFacilities();

    @Query("select s from ParkingSlot s join fetch s.facility")
    List<ParkingSlot> findAllWithFacility();

    /** Serialises bookings of one slot: reserve/reschedule take this lock first. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from ParkingSlot s where s.slotId = :id")
    Optional<ParkingSlot> lockById(@Param("id") Long id);

    @Modifying
    @Query("delete from ParkingSlot s where s.facility = :facility")
    void deleteByFacility(@Param("facility") Facility facility);
}

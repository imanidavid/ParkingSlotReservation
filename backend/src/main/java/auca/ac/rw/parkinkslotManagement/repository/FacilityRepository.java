package auca.ac.rw.parkinkslotManagement.repository;

import auca.ac.rw.parkinkslotManagement.model.Facility;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FacilityRepository extends JpaRepository<Facility, Long> {

    Optional<Facility> findByCode(String code);

    boolean existsByCode(String code);

    boolean existsByNameIgnoreCase(String name);

    List<Facility> findAllByOrderByFacilityIdAsc();

    List<Facility> findByActiveTrueOrderByFacilityIdAsc();
}

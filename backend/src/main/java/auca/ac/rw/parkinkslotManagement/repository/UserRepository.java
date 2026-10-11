package auca.ac.rw.parkinkslotManagement.repository;

import auca.ac.rw.parkinkslotManagement.model.Facility;
import auca.ac.rw.parkinkslotManagement.model.User;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    long countByAssignedFacility(Facility facility);
}

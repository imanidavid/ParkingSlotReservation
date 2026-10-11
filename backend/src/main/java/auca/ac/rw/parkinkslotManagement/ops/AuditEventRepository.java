package auca.ac.rw.parkinkslotManagement.ops;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface AuditEventRepository extends MongoRepository<AuditEvent, String> {

    List<AuditEvent> findAllByOrderByAtDesc(Pageable page);

    List<AuditEvent> findByActionOrderByAtDesc(String action, Pageable page);

    List<AuditEvent> findByFacilityOrderByAtDesc(String facility, Pageable page);
}

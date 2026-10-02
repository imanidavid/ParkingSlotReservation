package auca.ac.rw.parkinkslotManagement.ops;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface NotificationRecordRepository extends MongoRepository<NotificationRecord, String> {

    List<NotificationRecord> findAllByOrderByAtDesc(Pageable page);

    List<NotificationRecord> findBySerialOrderByAtDesc(String serial);
}

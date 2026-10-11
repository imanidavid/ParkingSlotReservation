package auca.ac.rw.parkinkslotManagement;

import java.util.TimeZone;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ParkinkslotManagementApplication {

	public static void main(String[] args) {
		// All times are Kigali local time (the database stores local timestamps).
		TimeZone.setDefault(TimeZone.getTimeZone(System.getenv().getOrDefault("KARITA_TZ", "Africa/Kigali")));
		SpringApplication.run(ParkinkslotManagementApplication.class, args);
	}

}

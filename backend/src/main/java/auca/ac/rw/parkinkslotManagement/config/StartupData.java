package auca.ac.rw.parkinkslotManagement.config;

import auca.ac.rw.parkinkslotManagement.seed.DataSeeder;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.stereotype.Component;

/**
 * Database constraints, then demo data, before the web server starts
 * accepting requests (singletons are initialised before Tomcat opens its port),
 * so no request ever sees a half-seeded database.
 */
@Component
public class StartupData implements SmartInitializingSingleton {

    private final SchemaInitializer schema;
    private final DataSeeder seeder;

    public StartupData(SchemaInitializer schema, DataSeeder seeder) {
        this.schema = schema;
        this.seeder = seeder;
    }

    @Override
    public void afterSingletonsInstantiated() {
        schema.apply();
        seeder.seedIfEmpty();
    }
}

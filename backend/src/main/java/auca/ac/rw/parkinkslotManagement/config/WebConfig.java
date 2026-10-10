package auca.ac.rw.parkinkslotManagement.config;

import auca.ac.rw.parkinkslotManagement.web.ApiAuthInterceptor;
import java.time.Clock;
import java.time.Duration;
import java.time.ZoneId;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final ApiAuthInterceptor apiAuth;

    public WebConfig(ApiAuthInterceptor apiAuth) {
        this.apiAuth = apiAuth;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(apiAuth)
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/auth/login", "/api/auth/register", "/api/auth/providers");
    }

    /**
     * "Now" for every rule; tests can replace it with a fixed clock.
     *
     * <p>{@code karita.clock-offset} shifts it by an ISO-8601 duration
     * ({@code PT-47280S}, say). It is unset in every normal run, so the default
     * behaviour is exactly {@code Clock.system}.
     *
     * <p>It exists because much of the application is only reachable during a
     * facility's opening hours — you cannot book a bay for a window that has
     * closed, and the attendant's verify screen deliberately ignores
     * reservations that have already ended. That makes the browser suite
     * fail after 22:00 for reasons that have nothing to do with the code, so
     * it pins "now" to mid-morning instead. Shifting the clock rather than
     * special-casing the tests keeps one definition of now: the seeder,
     * validation and the views all move together.
     */
    @Bean
    public Clock clock(
            @Value("${karita.timezone:Africa/Kigali}") String zone,
            @Value("${karita.clock-offset:}") String offset) {
        Clock base = Clock.system(ZoneId.of(zone));
        return offset.isBlank() ? base : Clock.offset(base, Duration.parse(offset));
    }
}

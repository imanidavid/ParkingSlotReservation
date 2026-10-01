package auca.ac.rw.parkinkslotManagement.config;

import auca.ac.rw.parkinkslotManagement.web.ApiAuthInterceptor;
import java.time.Clock;
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
                .excludePathPatterns("/api/auth/login", "/api/auth/register");
    }

    /** "Now" for every rule; tests can replace it with a fixed clock. */
    @Bean
    public Clock clock(@Value("${karita.timezone:Africa/Kigali}") String zone) {
        return Clock.system(ZoneId.of(zone));
    }
}

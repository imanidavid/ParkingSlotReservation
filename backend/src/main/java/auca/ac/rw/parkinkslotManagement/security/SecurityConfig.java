package auca.ac.rw.parkinkslotManagement.security;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;

/**
 * Spring Security is here for exactly one job: the OAuth2 handshake. It does not
 * do authorization.
 *
 * <p>Access control stays where it was — {@code OriginCheckFilter},
 * {@code PageAccessFilter} and {@code ApiAuthInterceptor}, all of which run
 * ahead of the Spring Security chain and already understand this application's
 * roles and per-resource ownership rules. So every request is {@code permitAll}
 * here; handing authorization to Spring Security as well would mean two systems
 * deciding the same question, and eventually disagreeing.
 *
 * <p>Its CSRF, form login, HTTP Basic and logout are all switched off for the
 * same reason: the application already has its own, and a second one on the same
 * paths is a bug waiting to happen (Spring's logout is {@code POST /logout},
 * this application's is {@code GET /logout}).
 *
 * <p>{@code oauth2Login} is only wired when a client registration actually
 * exists. Without that check, an unconfigured deployment fails to start.
 */
@Configuration
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            ObjectProvider<ClientRegistrationRepository> clients,
            AuthenticationSuccessHandler oauthSuccess,
            AuthenticationFailureHandler oauthFailure)
            throws Exception {

        http.authorizeHttpRequests(a -> a.anyRequest().permitAll())
                .csrf(csrf -> csrf.disable())
                .formLogin(form -> form.disable())
                .httpBasic(basic -> basic.disable())
                .logout(out -> out.disable());

        if (clients.getIfAvailable() != null) {
            http.oauth2Login(o -> o
                    .loginPage("/login.html")
                    .successHandler(oauthSuccess)
                    .failureHandler(oauthFailure));
        }
        return http.build();
    }
}

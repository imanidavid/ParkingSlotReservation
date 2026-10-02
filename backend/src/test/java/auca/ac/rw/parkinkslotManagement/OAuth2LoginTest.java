package auca.ac.rw.parkinkslotManagement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import auca.ac.rw.parkinkslotManagement.model.Role;
import auca.ac.rw.parkinkslotManagement.model.User;
import auca.ac.rw.parkinkslotManagement.repository.UserRepository;
import auca.ac.rw.parkinkslotManagement.service.FederatedLoginService;
import auca.ac.rw.parkinkslotManagement.service.PasswordHasher;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * OAuth2 sign-in, with a dummy Google client registration so the authorisation
 * redirect can be checked without contacting Google.
 */
@SpringBootTest(properties = {
    "karita.seed=false",
    "spring.security.oauth2.client.registration.google.client-id=test-client-id",
    "spring.security.oauth2.client.registration.google.client-secret=test-client-secret"
})
@AutoConfigureMockMvc
@ActiveProfiles("smoke")
class OAuth2LoginTest {

    @Autowired MockMvc mvc;
    @Autowired FederatedLoginService federated;
    @Autowired UserRepository users;
    @Autowired PasswordHasher hasher;

    @Test
    void providersEndpointAdvertisesGoogleAndNeedsNoSession() throws Exception {
        mvc.perform(get("/api/auth/providers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.providers[0].id").value("google"))
                .andExpect(jsonPath("$.providers[0].url").value("/oauth2/authorization/google"));
    }

    @Test
    void authorizationEndpointRedirectsToGoogle() throws Exception {
        MvcResult result = mvc.perform(get("/oauth2/authorization/google"))
                .andExpect(status().is3xxRedirection())
                .andReturn();

        String location = result.getResponse().getRedirectedUrl();
        assertThat(location).startsWith("https://accounts.google.com/o/oauth2/v2/auth");
        assertThat(location).contains("client_id=test-client-id");
        assertThat(location).contains("redirect_uri=");
        assertThat(location).contains("scope=");
        // Without state the callback can't be tied back to this browser.
        assertThat(location).contains("state=");
    }

    @Test
    void firstGoogleSignInCreatesADriver() {
        String email = "newcomer." + System.nanoTime() + "@gmail.com";
        User created = federated.findOrCreate(email, "Alice Uwase");

        assertThat(created.getUserId()).isNotNull();
        assertThat(created.getEmail()).isEqualTo(email);
        assertThat(created.getFullName()).isEqualTo("Alice Uwase");
        assertThat(created.getRole()).isEqualTo(Role.USER);
    }

    /**
     * Signing in through Google must not hand anyone a role, or take one away:
     * the account is looked up by email, never replaced. Note the mixed case —
     * matching has to be case-insensitive or a second account appears.
     */
    @Test
    void anExistingAccountKeepsItsIdentityAndRole() {
        String email = "boss." + System.nanoTime() + "@karita.rw";
        User admin = new User();
        admin.setEmail(email);
        admin.setFullName("Real Admin");
        admin.setPasswordHash(hasher.hash("karita123"));
        admin.setRole(Role.ADMIN);
        users.save(admin);

        User linked = federated.findOrCreate(email.toUpperCase(), "Someone Else Entirely");

        assertThat(linked.getUserId()).isEqualTo(admin.getUserId());
        assertThat(linked.getRole()).isEqualTo(Role.ADMIN);
        assertThat(linked.getFullName()).isEqualTo("Real Admin");
    }

    /** No password is set, so none may be guessable — not even a shared placeholder. */
    @Test
    void federatedAccountsGetAnUnusableRandomPassword() {
        User a = federated.findOrCreate("rand.a." + System.nanoTime() + "@gmail.com", "A Driver");
        User b = federated.findOrCreate("rand.b." + System.nanoTime() + "@gmail.com", "B Driver");

        assertThat(a.getPasswordHash()).isNotEqualTo(b.getPasswordHash());
        assertThat(hasher.matches("", a.getPasswordHash())).isFalse();
        assertThat(hasher.matches("password", a.getPasswordHash())).isFalse();
    }

    /** Google doesn't always send a name. */
    @Test
    void missingNameFallsBackToTheEmailLocalPart() {
        User u = federated.findOrCreate("mugisha." + System.nanoTime() + "@gmail.com", null);
        assertThat(u.getFullName()).startsWith("mugisha.");
    }
}

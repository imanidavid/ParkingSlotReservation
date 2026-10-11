package auca.ac.rw.parkinkslotManagement.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class LogoutController {

    @GetMapping("/logout")
    public void logout(HttpServletRequest req, HttpServletResponse res) throws IOException {
        Session.signOut(req, res);
        res.setHeader("Cache-Control", "no-store");
        res.sendRedirect("/login.html");
    }
}

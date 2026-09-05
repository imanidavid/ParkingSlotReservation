package rw.ac.auca.parking.controller;

import rw.ac.auca.parking.dao.HibernateUtil;
import rw.ac.auca.parking.model.User;
import org.hibernate.Session;
import org.hibernate.Transaction;

import javax.faces.application.FacesMessage;
import javax.faces.bean.ManagedBean;
import javax.faces.bean.SessionScoped;
import javax.faces.context.FacesContext;
import java.util.List;

/**
 * The Class UserController.
 *
 * @author Imani First
 * @version 1.0
 */
@ManagedBean
@SessionScoped
public class UserController {
    private User newUser = new User();
    private String roleOptions[] = {"Admin", "User"};
    private User currentUser = new User();

    // Register new user
    public String registerUser() {
        HibernateUtil hibernateUtil = new HibernateUtil();
        Session ss = hibernateUtil.getSessionFactory().openSession();
        Long count = (Long) ss.createQuery("select count(u) from User u where u.email = :email")
                .setParameter("email", newUser.getEmail())
                .uniqueResult();
        if (count != null && count > 0) {
            ss.close();
            FacesContext.getCurrentInstance().
                    addMessage(null, new FacesMessage(FacesMessage.SEVERITY_ERROR,
                            "Email is already registered. Please log in or use a different email.", null));
            return null;
        }
        Transaction tr = ss.beginTransaction();
        ss.save(newUser);
        tr.commit();
        ss.close();

        FacesContext.getCurrentInstance().
                addMessage(null, new FacesMessage(FacesMessage.SEVERITY_INFO,
                        "Registration successful! Welcome, " + newUser.getFullName(), null));
        FacesContext.getCurrentInstance().getExternalContext().getFlash().setKeepMessages(true);

        currentUser = newUser;
        return "user-dashboard?faces-redirect=true";
    }

    // Login
    public String login() {
        HibernateUtil hibernateUtil = new HibernateUtil();
        Session ss = hibernateUtil.getSessionFactory().openSession();
        // In a real app, we'd verify password hash
        User user = (User) ss.createQuery("from User where email = :email and password = :password")
                .setParameter("email", newUser.getEmail())
                .setParameter("password", newUser.getPassword())
                .uniqueResult();
        ss.close();

        if (user != null) {
            currentUser = user;
            return "user-dashboard?faces-redirect=true";
        } else {
            FacesContext.getCurrentInstance().
                    addMessage(null, new FacesMessage(FacesMessage.SEVERITY_ERROR,
                            "Invalid email or password", null));
            return "index";
        }
    }

    // Logout
    public String logout() {
        FacesContext ctx = FacesContext.getCurrentInstance();
        ctx.getExternalContext().invalidateSession();
        return "/index?faces-redirect=true";
    }

    // Getters and setters
    public User getNewUser() {
        return newUser;
    }

    public void setNewUser(User newUser) {
        this.newUser = newUser;
    }

    public String[] getRoleOptions() {
        return roleOptions;
    }

    public void setRoleOptions(String[] roleOptions) {
        this.roleOptions = roleOptions;
    }

    public User getCurrentUser() {
        return currentUser;
    }

    public void setCurrentUser(User currentUser) {
        this.currentUser = currentUser;
    }
}
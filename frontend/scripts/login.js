// Sign-in form: client-side checks, then POST to the auth endpoint.
(function () {
  var AUTH_ENDPOINT = "/api/auth/login";
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  var form = document.getElementById("signin-form");
  var email = document.getElementById("email");
  var password = document.getElementById("password");
  var toggle = document.getElementById("password-toggle");
  var submit = form.querySelector("button[type=submit]");
  var status = document.getElementById("signin-status");
  var params = new URLSearchParams(window.location.search);

  function safeNext() {
    var next = params.get("next") || "";
    return /^[a-z-]+\.html(\?[^#]*)?(#.*)?$/.test(next) ? next : "";
  }

  if (params.get("reason") === "expired") {
    status.textContent = "Your session ended (the server restarted or you were away too long). Sign in again.";
  }

  function setError(input, message) {
    var slot = document.getElementById(input.id + "-error");
    slot.textContent = message || "";
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  function validate() {
    var ok = true;
    var e = email.value.trim();

    if (!e) {
      setError(email, "Enter your email address.");
      ok = false;
    } else if (!EMAIL_RE.test(e)) {
      setError(email, "That email address doesn't look right.");
      ok = false;
    } else {
      setError(email, "");
    }

    if (!password.value) {
      setError(password, "Enter your password.");
      ok = false;
    } else {
      setError(password, "");
    }

    return ok;
  }

  toggle.addEventListener("click", function () {
    var hidden = password.type === "password";
    password.type = hidden ? "text" : "password";
    toggle.textContent = hidden ? "Hide" : "Show";
    toggle.setAttribute("aria-pressed", String(hidden));
    toggle.setAttribute("aria-label", hidden ? "Hide password" : "Show password");
  });

  [email, password].forEach(function (input) {
    input.addEventListener("input", function () {
      if (input.getAttribute("aria-invalid")) setError(input, "");
      status.textContent = "";
    });
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    status.textContent = "";

    if (!validate()) {
      form.querySelector("[aria-invalid=true]").focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = "Signing in…";

    try {
      var res = await fetch(AUTH_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: email.value.trim(),
          password: password.value,
        }),
      });

      if (res.ok) {
        var data = await res.json().catch(function () {
          return {};
        });
        // Return to the page that sent us here, if it's one of ours.
        // The server still sends each role to pages it may open.
        window.location.assign(safeNext() || data.redirect || "home.html");
        return;
      }

      if (res.status === 429) {
        status.textContent = "Too many sign-in attempts. Wait a few minutes and try again.";
      } else if (res.status === 401) {
        status.textContent = "Email or password is incorrect.";
      } else if (res.status === 404 || res.status === 405 || res.status === 501) {
        // A plain file server (not `npm start`) is serving this page.
        status.textContent =
          "This page isn't being served by the Karita server, so sign-in can't work here. " +
          "Run `npm start` in the project folder and open http://localhost:8080.";
      } else {
        status.textContent = "Sign in failed (server error " + res.status + "). Try again in a moment.";
      }
    } catch (err) {
      status.textContent =
        "Can't reach the Karita server at " + window.location.origin + ". Is `npm start` running?";
    }

    submit.disabled = false;
    submit.textContent = "Sign in";
  });
})();

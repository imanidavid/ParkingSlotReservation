// Registration: client-side checks (same rules as the server), then POST.
(function () {
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  var form = document.getElementById("register-form");
  var submit = form.querySelector("button[type=submit]");
  var status = document.getElementById("register-status");
  var toggle = document.getElementById("password-toggle");
  var inputs = {
    fullName: document.getElementById("fullName"),
    email: document.getElementById("email"),
    password: document.getElementById("password"),
    plate: document.getElementById("plate"),
  };
  var vehicleError = document.getElementById("vehicle-error");

  function setError(input, message) {
    document.getElementById(input.id + "-error").textContent = message || "";
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  function cleanPlate(value) {
    var p = String(value || "").toUpperCase().replace(/\s+/g, " ").trim();
    return /^[A-Z0-9 ]{4,12}$/.test(p) && /\d/.test(p) ? p : null;
  }

  function vehicle() {
    var checked = form.querySelector("input[name=vehicle]:checked");
    return checked ? checked.value : "";
  }

  function validate() {
    var errors = {};
    var name = inputs.fullName.value.trim();
    var email = inputs.email.value.trim();
    var password = inputs.password.value;

    if (name.length < 2) errors.fullName = "Enter your full name.";
    if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
    if (password.length < 8) errors.password = "Use at least 8 characters.";
    else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = "Use letters and at least one number.";
    if (!cleanPlate(inputs.plate.value)) errors.plate = "Enter your plate, e.g. RAD 482 C.";
    if (!vehicle()) errors.vehicle = "Choose your vehicle type.";
    return errors;
  }

  function show(errors) {
    var first = null;
    Object.keys(inputs).forEach(function (k) {
      setError(inputs[k], errors[k]);
      if (errors[k] && !first) first = inputs[k];
    });
    vehicleError.textContent = errors.vehicle || "";
    if (first) first.focus();
    return !first && !errors.vehicle;
  }

  toggle.addEventListener("click", function () {
    var hidden = inputs.password.type === "password";
    inputs.password.type = hidden ? "text" : "password";
    toggle.textContent = hidden ? "Hide" : "Show";
    toggle.setAttribute("aria-pressed", String(hidden));
    toggle.setAttribute("aria-label", hidden ? "Hide password" : "Show password");
  });

  Object.keys(inputs).forEach(function (k) {
    inputs[k].addEventListener("input", function () {
      if (inputs[k].getAttribute("aria-invalid")) setError(inputs[k], "");
      status.textContent = "";
    });
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    status.textContent = "";
    if (!show(validate())) return;

    var plate = cleanPlate(inputs.plate.value);
    inputs.plate.value = plate;
    submit.disabled = true;
    submit.textContent = "Creating account…";

    try {
      var res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          fullName: inputs.fullName.value.trim(),
          email: inputs.email.value.trim(),
          password: inputs.password.value,
          plate: plate,
          vehicle: vehicle(),
        }),
      });
      var data = await res.json().catch(function () { return {}; });

      if (res.ok) {
        window.location.assign(data.redirect || "home.html");
        return;
      }
      if (data.fields) {
        show(data.fields);
      } else if (res.status === 404 || res.status === 405 || res.status === 501) {
        status.textContent =
          "This page isn't being served by the Karita server. Run `npm start` and open http://localhost:8080.";
      } else {
        status.textContent = data.error || "Registration failed. Try again in a moment.";
      }
    } catch (err) {
      status.textContent = "Can't reach the Karita server at " + window.location.origin + ". Is `npm start` running?";
    }

    submit.disabled = false;
    submit.textContent = "Create account";
  });
})();

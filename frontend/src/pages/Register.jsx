import { useState } from "react";
import FieldError from "../components/FieldError.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import PasswordInput from "./PasswordInput.jsx";
import { cleanPlate } from "../lib/format.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ORDER = ["fullName", "email", "password", "plate"];

const VEHICLES = [
  { id: "v-moto", value: "Motorcycle" },
  { id: "v-car", value: "Car" },
  { id: "v-suv", value: "SUV" },
  { id: "v-truck", value: "Truck" },
];

export default function Register() {
  const [values, setValues] = useState({ fullName: "", email: "", password: "", plate: "" });
  const [vehicle, setVehicle] = useState("Car");
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (name) => (value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: "" } : e));
    setStatus("");
  };

  // Mirrors the server's rules; the server validates again regardless.
  function validate() {
    const e = {};
    if (values.fullName.trim().length < 2) e.fullName = "Enter your full name.";
    if (!EMAIL_RE.test(values.email.trim())) e.email = "Enter a valid email address.";
    if (values.password.length < 8) e.password = "Use at least 8 characters.";
    else if (!/[A-Za-z]/.test(values.password) || !/\d/.test(values.password)) {
      e.password = "Use letters and at least one number.";
    }
    if (!cleanPlate(values.plate)) e.plate = "Enter your plate, e.g. RAD 482 C.";
    if (!vehicle) e.vehicle = "Choose your vehicle type.";
    return e;
  }

  function show(found) {
    setErrors(found);
    const first = ORDER.find((k) => found[k]);
    if (first) document.getElementById(first)?.focus();
    return !first && !found.vehicle;
  }

  async function onSubmit(event) {
    event.preventDefault();
    setStatus("");
    if (!show(validate())) return;

    const plate = cleanPlate(values.plate);
    setValues((v) => ({ ...v, plate }));
    setBusy(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          fullName: values.fullName.trim(),
          email: values.email.trim(),
          password: values.password,
          plate,
          vehicle,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        window.location.assign(data.redirect || "home.html");
        return;
      }
      if (data.fields) show(data.fields);
      else if ([404, 405, 501].includes(res.status)) {
        setStatus("This page isn't being served by the Karita server. Run `npm start` and open http://localhost:8080.");
      } else {
        setStatus(data.error || "Registration failed. Try again in a moment.");
      }
    } catch {
      setStatus(`Can't reach the Karita server at ${window.location.origin}. Is \`npm start\` running?`);
    }
    setBusy(false);
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar__inner">
          <ThemeToggle />
        </div>
      </header>

      <main className="auth">
        <section className="auth__panel auth__panel--wide" aria-labelledby="register-title">
          <div className="auth__head">
            <p className="wordmark">KARITA</p>
            <span className="wordmark__serial mono">№ 0001</span>
          </div>

          <hr className="rule" />

          <div className="auth__body">
            <h1 className="auth__title" id="register-title">
              Register
            </h1>

            <form className="auth__form" id="register-form" noValidate onSubmit={onSubmit}>
              <div className="field">
                <label className="field__label" htmlFor="fullName">
                  Full name
                </label>
                <input
                  className="input"
                  id="fullName"
                  name="fullName"
                  autoComplete="name"
                  maxLength={80}
                  aria-describedby="fullName-error"
                  aria-invalid={errors.fullName ? "true" : undefined}
                  value={values.fullName}
                  onChange={(e) => set("fullName")(e.target.value)}
                  required
                />
                <FieldError for="fullName" error={errors.fullName} role="alert" />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="email">
                  Email
                </label>
                <input
                  className="input"
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  spellCheck="false"
                  maxLength={120}
                  aria-describedby="email-error"
                  aria-invalid={errors.email ? "true" : undefined}
                  value={values.email}
                  onChange={(e) => set("email")(e.target.value)}
                  required
                />
                <FieldError for="email" error={errors.email} role="alert" />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="password">
                  Password
                </label>
                <PasswordInput
                  id="password"
                  value={values.password}
                  onChange={set("password")}
                  autoComplete="new-password"
                  maxLength={128}
                  describedBy="password-hint password-error"
                  invalid={!!errors.password}
                />
                <span className="field__hint" id="password-hint">
                  At least 8 characters, with letters and a number.
                </span>
                <FieldError for="password" error={errors.password} role="alert" />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="plate">
                  Vehicle plate
                </label>
                <input
                  className="input mono input--plate"
                  id="plate"
                  name="plate"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck="false"
                  placeholder="RAD 482 C"
                  maxLength={12}
                  aria-describedby="plate-error"
                  aria-invalid={errors.plate ? "true" : undefined}
                  value={values.plate}
                  onChange={(e) => set("plate")(e.target.value)}
                  required
                />
                <FieldError for="plate" error={errors.plate} role="alert" />
              </div>

              <fieldset className="field register__vehicle register__fieldset">
                <legend className="field__label register__legend">Vehicle type</legend>
                <div className="chips" id="vehicle-chips">
                  {VEHICLES.map((v) => (
                    <Chip key={v.id} {...v} checked={vehicle === v.value} onPick={setVehicle} />
                  ))}
                </div>
                <FieldError for="vehicle" error={errors.vehicle} role="alert" />
              </fieldset>

              <p className="auth__status" id="register-status" role="status" aria-live="polite">
                {status}
              </p>

              <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
                {busy ? "Creating account…" : "Create account"}
              </button>
            </form>
          </div>

          <hr className="rule" />

          <p className="auth__foot">
            Already registered?{" "}
            <a className="link" href="login.html">
              Sign in
            </a>
          </p>
        </section>
      </main>
    </>
  );
}

// The chip is the <label>; the radio behind it is what gets the styling hook.
function Chip({ id, value, checked, onPick }) {
  return (
    <>
      <input
        className="chip__input"
        type="radio"
        name="vehicle"
        id={id}
        value={value}
        checked={checked}
        onChange={() => onPick(value)}
      />
      <label className="chip" htmlFor={id}>
        {value.toUpperCase()}
      </label>
    </>
  );
}

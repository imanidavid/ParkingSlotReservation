import { useEffect, useState } from "react";
import FieldError from "../components/FieldError.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import PasswordInput from "./PasswordInput.jsx";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only ever return to one of our own pages. */
function safeNext() {
  const next = new URLSearchParams(window.location.search).get("next") || "";
  return /^[a-z-]+\.html(\?[^#]*)?(#.*)?$/.test(next) ? next : "";
}

export default function Login() {
  const params = new URLSearchParams(window.location.search);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(() => {
    if (params.get("reason") === "expired") {
      return "Your session ended (the server restarted or you were away too long). Sign in again.";
    }
    return params.get("error") || "";
  });
  const [providers, setProviders] = useState([]);

  // Google sign-in is optional: the button only appears when the server says a
  // provider is configured, so an unconfigured deployment shows nothing broken.
  useEffect(() => {
    let live = true;
    fetch("/api/auth/providers", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => live && data?.providers?.length && setProviders(data.providers))
      .catch(() => {
        /* no providers shown; password sign-in still works */
      });
    return () => {
      live = false;
    };
  }, []);

  function validate() {
    const next = {};
    const e = email.trim();
    if (!e) next.email = "Enter your email address.";
    else if (!EMAIL_RE.test(e)) next.email = "That email address doesn't look right.";
    if (!password) next.password = "Enter your password.";
    return next;
  }

  async function onSubmit(event) {
    event.preventDefault();
    setStatus("");

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(found.email ? "email" : "password")?.focus();
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        // Return to the page that sent us here, if it's one of ours. The server
        // still sends each role only to pages it may open.
        window.location.assign(safeNext() || data.redirect || "home.html");
        return;
      }
      if (res.status === 429) {
        setStatus("Too many sign-in attempts. Wait a few minutes and try again.");
      } else if (res.status === 401) {
        setStatus("Email or password is incorrect.");
      } else if ([404, 405, 501].includes(res.status)) {
        // A plain file server (not `npm start`) is serving this page.
        setStatus(
          "This page isn't being served by the Karita server, so sign-in can't work here. " +
            "Run `npm start` in the project folder and open http://localhost:8080.",
        );
      } else {
        setStatus(`Sign in failed (server error ${res.status}). Try again in a moment.`);
      }
    } catch {
      setStatus(`Can't reach the Karita server at ${window.location.origin}. Is \`npm start\` running?`);
    }
    setBusy(false);
  }

  const onType = (set) => (value) => {
    set(value);
    setErrors({});
    setStatus("");
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar__inner">
          <ThemeToggle />
        </div>
      </header>

      <main className="auth">
        <section className="auth__panel" aria-labelledby="signin-title">
          <div className="auth__head">
            <p className="wordmark">KARITA</p>
            <span className="wordmark__serial mono">№ 0001</span>
          </div>

          <hr className="rule" />

          <div className="auth__body">
            <h1 className="auth__title" id="signin-title">
              Sign in
            </h1>

            <form className="auth__form" id="signin-form" noValidate onSubmit={onSubmit}>
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
                  aria-describedby="email-error"
                  aria-invalid={errors.email ? "true" : undefined}
                  value={email}
                  onChange={(e) => onType(setEmail)(e.target.value)}
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
                  value={password}
                  onChange={onType(setPassword)}
                  autoComplete="current-password"
                  describedBy="password-error"
                  invalid={!!errors.password}
                />
                <FieldError for="password" error={errors.password} role="alert" />
              </div>

              <p className="auth__status" id="signin-status" role="status" aria-live="polite">
                {status}
              </p>

              <button className="btn btn--primary btn--block" type="submit" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>

            {providers.length > 0 && (
              <div className="federated" id="federated">
                <p className="federated__divider">
                  <span>or</span>
                </p>
                <div id="federated-buttons">
                  {providers.map((p) => (
                    <a
                      key={p.name}
                      className="btn btn--block btn--federated"
                      href={p.url + (safeNext() ? "?next=" + encodeURIComponent(safeNext()) : "")}
                    >
                      Continue with {p.name}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          <hr className="rule" />

          <p className="auth__foot">
            New here?{" "}
            <a className="link" href="register.html">
              Register
            </a>
          </p>
        </section>
      </main>
    </>
  );
}

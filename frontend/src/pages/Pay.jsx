import { useEffect, useState } from "react";
import AppBar from "../components/AppBar.jsx";
import OfflineBanner from "../components/OfflineBanner.jsx";
import { api } from "../lib/api.js";
import { param, rwf } from "../lib/format.js";

const SERIAL = param("serial");

const METHODS = [
  { id: "m-cash", value: "Cash", label: "CASH" },
  { id: "m-momo", value: "Mobile Money", label: "MOBILE MONEY" },
  { id: "m-card", value: "Card", label: "CARD" },
];

const groups = (digits) => digits.replace(/(\d{4})(?=\d)/g, "$1 ");

export default function Pay() {
  const [reservation, setReservation] = useState(null);
  const [method, setMethod] = useState("Mobile Money");
  const [values, setValues] = useState({ phone: "", cardNumber: "", expiry: "", cvc: "", reference: "" });
  const [errors, setErrors] = useState({});
  const [payError, setPayError] = useState("");
  const [blocked, setBlocked] = useState("");
  const [canPay, setCanPay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!/^\d{5}$/.test(SERIAL)) {
      window.location.replace("reservations.html");
      return;
    }
    let live = true;
    api(`/api/reservations/${encodeURIComponent(SERIAL)}`)
      .then((res) => {
        if (!live) return;
        const r = res.reservation;
        setReservation(r);
        if (r.display === "Paid") {
          window.location.replace("ticket.html?serial=" + encodeURIComponent(SERIAL));
          return;
        }
        if (!r.can.pay) {
          setBlocked(r.status === "Cancelled" ? "This reservation was cancelled." : "This reservation has ended.");
          return;
        }
        if (r.payment.status === "Failed") {
          setPayError("The last payment attempt failed. Try again or choose another method.");
        }
        setCanPay(true);
      })
      .catch((err) => {
        if (!live) return;
        if (err.status === 404) setBlocked("Reservation not found.");
        else setPayError(err.message);
      })
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, []);

  function set(name, value) {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: "" } : e));
  }

  function pickMethod(next) {
    setMethod(next);
    setErrors({});
    setPayError("");
  }

  async function onSubmit(event) {
    event.preventDefault();
    setErrors({});
    setPayError("");

    const body = { method, reference: values.reference.trim() };
    if (method === "Mobile Money") body.phone = values.phone;
    if (method === "Card") {
      body.cardNumber = values.cardNumber;
      body.expiry = values.expiry;
      body.cvc = values.cvc;
    }

    setBusy(true);
    try {
      await api(`/api/reservations/${encodeURIComponent(SERIAL)}/payment`, { method: "POST", body });
      window.location.assign("ticket.html?serial=" + encodeURIComponent(SERIAL));
      return;
    } catch (err) {
      setBusy(false);
      const fields = err.data?.fields || {};
      const known = Object.keys(fields).filter((k) => k in values);
      setErrors(Object.fromEntries(known.map((k) => [k, fields[k]])));
      if (fields.method) setPayError(fields.method);
      else if (!known.length) setPayError(err.message);
      if (known.length) document.getElementById(known[0])?.focus();
      if (err.status === 409) setBlocked(err.message);
    }
  }

  const r = reservation;
  const stamp = (iso) => (iso ? iso.split("T") : ["—", "—"]);
  const [sd, st] = stamp(r?.start);
  const [ed, et] = stamp(r?.end);

  return (
    <>
      <AppBar active="reservations" />
      <OfflineBanner />

      <main className="narrow" id="pay" aria-busy={loaded ? undefined : "true"}>
        <h1 className="sr-only">Payment</h1>

        <section className="mini" id="mini" aria-label="Reservation summary">
          <div className="mini__stub">
            <span className="mini__serial" id="mini-serial">
              {r ? "№ " + r.serial : "№ —"}
            </span>
          </div>
          <dl className="mini__spec">
            <div>
              <dt>Slot</dt>
              <dd id="mini-slot">{r?.slot || "—"}</dd>
            </div>
            <div>
              <dt>Facility</dt>
              <dd id="mini-facility">{r ? (r.facility + " · " + r.level).toUpperCase() : "—"}</dd>
            </div>
            <div>
              <dt>Window</dt>
              <dd id="mini-window">{r ? `${sd} ${st} → ${sd === ed ? et : ed + " " + et}` : "—"}</dd>
            </div>
            <div>
              <dt>Plate</dt>
              <dd id="mini-plate">{r?.plate || "—"}</dd>
            </div>
          </dl>
        </section>

        <hr className="rule narrow__rule" />

        <section aria-labelledby="payment-label">
          <h2 className="section-label" id="payment-label">
            Payment
          </h2>

          <div className="due">
            <span className="due__label">Amount due</span>
            <span className="due__amount" id="amount-due">
              {r ? rwf(r.amount) : "—"}
            </span>
          </div>

          {blocked ? (
            <p className="empty">
              {blocked}{" "}
              <a className="link" href="reservations.html">
                View your reservations
              </a>
            </p>
          ) : (
            <form className="payform" id="pay-form" noValidate onSubmit={onSubmit}>
              <fieldset className="payform__block">
                <legend className="payform__label">Method</legend>
                <div className="chips" id="methods">
                  {METHODS.map((m) => (
                    <Method key={m.id} {...m} checked={method === m.value} onPick={pickMethod} />
                  ))}
                </div>
                <p className="payform__hint" id="cash-hint" hidden={method !== "Cash"}>
                  Pay the attendant at entry. Your slot stays reserved.
                </p>
              </fieldset>

              <div className="payform__block" id="momo-fields" hidden={method !== "Mobile Money"}>
                <label className="payform__label" htmlFor="phone">
                  Mobile number
                </label>
                <input
                  className="input mono"
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+250 7XX XXX XXX"
                  aria-describedby="phone-error"
                  aria-invalid={errors.phone ? "true" : undefined}
                  value={values.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
                <span className="field__error" id="phone-error">
                  {errors.phone || ""}
                </span>
              </div>

              <div className="payform__block" id="card-fields" hidden={method !== "Card"}>
                <div className="cardrow">
                  <div className="cardrow__number">
                    <label className="payform__label" htmlFor="cardNumber">
                      Card number
                    </label>
                    <input
                      className="input mono"
                      id="cardNumber"
                      name="cardNumber"
                      inputMode="numeric"
                      autoComplete="cc-number"
                      placeholder="0000 0000 0000 0000"
                      maxLength={23}
                      aria-describedby="cardNumber-error"
                      aria-invalid={errors.cardNumber ? "true" : undefined}
                      value={values.cardNumber}
                      onChange={(e) => set("cardNumber", groups(e.target.value.replace(/\D/g, "").slice(0, 19)))}
                    />
                    <span className="field__error" id="cardNumber-error">
                      {errors.cardNumber || ""}
                    </span>
                  </div>
                  <div>
                    <label className="payform__label" htmlFor="expiry">
                      Expiry
                    </label>
                    <input
                      className="input mono"
                      id="expiry"
                      name="expiry"
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      placeholder="MM/YY"
                      maxLength={5}
                      aria-describedby="expiry-error"
                      aria-invalid={errors.expiry ? "true" : undefined}
                      value={values.expiry}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                        // Don't re-add the slash the backspace just removed.
                        const deleting = e.nativeEvent.inputType?.startsWith("delete");
                        set(
                          "expiry",
                          digits.length > 2 || (digits.length === 2 && !deleting)
                            ? digits.slice(0, 2) + "/" + digits.slice(2)
                            : digits,
                        );
                      }}
                    />
                    <span className="field__error" id="expiry-error">
                      {errors.expiry || ""}
                    </span>
                  </div>
                  <div>
                    <label className="payform__label" htmlFor="cvc">
                      CVC
                    </label>
                    <input
                      className="input mono"
                      id="cvc"
                      name="cvc"
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      placeholder="123"
                      maxLength={4}
                      aria-describedby="cvc-error"
                      aria-invalid={errors.cvc ? "true" : undefined}
                      value={values.cvc}
                      onChange={(e) => set("cvc", e.target.value.replace(/\D/g, "").slice(0, 4))}
                    />
                    <span className="field__error" id="cvc-error">
                      {errors.cvc || ""}
                    </span>
                  </div>
                </div>
              </div>

              <div className="payform__block">
                <label className="payform__label" htmlFor="reference">
                  Reference <span className="payform__optional">optional</span>
                </label>
                <input
                  className="input mono"
                  id="reference"
                  name="reference"
                  maxLength={80}
                  aria-describedby="reference-help reference-error"
                  aria-invalid={errors.reference ? "true" : undefined}
                  value={values.reference}
                  onChange={(e) => set("reference", e.target.value)}
                />
                <span className="payform__hint" id="reference-help">
                  Add a note for your records
                </span>
                <span className="field__error" id="reference-error">
                  {errors.reference || ""}
                </span>
              </div>

              <p className="payform__error" id="pay-error" role="alert">
                {payError}
              </p>

              <button className="btn btn--primary btn--block" type="submit" id="pay-btn" disabled={!canPay || busy}>
                {busy ? "Confirming…" : "Confirm payment"}
              </button>

              <hr className="rule" />
              <p className="payform__cancel">
                <a className="link" href="reservations.html">
                  Cancel
                </a>
              </p>
            </form>
          )}
        </section>
      </main>
    </>
  );
}

function Method({ id, value, label, checked, onPick }) {
  return (
    <>
      <input
        className="chip__input"
        type="radio"
        name="method"
        id={id}
        value={value}
        checked={checked}
        onChange={() => onPick(value)}
      />
      <label className="chip" htmlFor={id}>
        {label}
      </label>
    </>
  );
}

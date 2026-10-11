import { useEffect, useState } from "react";
import AppBar from "../components/AppBar.jsx";
import OfflineBanner from "../components/OfflineBanner.jsx";
import { qrCells } from "../components/Qr.jsx";
import { api } from "../lib/api.js";
import { pad2, param, rwf } from "../lib/format.js";
import { drawTicket, saveTicket, ticketFields } from "../lib/ticketCanvas.js";

const SERIAL = param("serial");
const SPEC_IDS = ["t-date", "t-window", "t-duration", "t-vehicle", "t-plate", "t-amount", "t-method"];

/** The line under the ticket changes with what actually happened to it. */
function smallPrint(r) {
  if (r.status === "Cancelled") return "This reservation was cancelled. The ticket is no longer valid.";
  if (r.payment.method === "Cash" && r.payment.status !== "Paid") {
    return `Pay ${rwf(r.amount)} in cash at entry. The attendant will verify your plate.`;
  }
  if (r.payment.paidAt) {
    const at = new Date(r.payment.paidAt);
    const when = `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())} ${pad2(at.getHours())}:${pad2(at.getMinutes())}`;
    return `Paid ${when}. Show this ticket at entry. The attendant will verify your plate; the pattern is decorative.`;
  }
  return "Show this ticket at entry. The attendant will verify your plate.";
}

export default function TicketPage() {
  const [r, setR] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
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
        setR(res.reservation);
        document.title = `Ticket № ${res.reservation.serial} · Karita`;
        // exposed for verification
        window.KaritaTicket = { draw: () => drawTicket(res.reservation) };
      })
      .catch((err) => live && setError(err.status === 404 ? "Ticket not found." : err.message))
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, []);

  async function onSave() {
    setSaving(true);
    setError("");
    try {
      await saveTicket(r);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  const f = r ? ticketFields(r) : null;

  return (
    <>
      <AppBar active="reservations" />
      <OfflineBanner />

      <main className="slip-page" id="slip-page" aria-busy={loaded ? undefined : "true"}>
        <h1 className="sr-only">Parking ticket</h1>

        <article className="slip" id="slip" aria-label="Parking ticket" hidden={!!error}>
          {/* paper grain */}
          <svg className="slip__grain" aria-hidden="true" focusable="false">
            <filter id="grain">
              <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <rect width="100%" height="100%" filter="url(#grain)" />
          </svg>

          {/* scalloped right edge */}
          <svg className="slip__scallops" aria-hidden="true" focusable="false">
            <defs>
              <pattern id="scallop" width="8" height="18" patternUnits="userSpaceOnUse">
                <path className="slip__notch" d="M8 5 A4 4 0 0 0 8 13 Z" />
                <path className="slip__edge" d="M7.5 0 V5 A3.5 3.5 0 0 0 7.5 13 V18" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#scallop)" />
          </svg>

          <div className="slip__top">
            <span className="slip__mark">KARITA</span>
            <span className="slip__serial" id="t-serial">
              {f ? f.serial : "№ —"}
            </span>
          </div>

          <div className="slip__hero">
            <p className="slip__slot" id="t-slot">
              {f ? f.slot : "—"}
            </p>
            <p className="slip__where" id="t-where">
              {f ? f.where : " "}
            </p>
          </div>

          <dl className="slip__spec">
            {SPEC_IDS.map((id, i) => (
              <div key={id}>
                <dt>{f ? f.rows[i][0] : ""}</dt>
                <dd id={id}>{f ? f.rows[i][1] : "—"}</dd>
              </div>
            ))}
          </dl>

          <div className="slip__bottom">
            <svg className="slip__qr" id="t-qr" viewBox="0 0 8 8" role="img" aria-label={f ? `Entry code for ticket ${f.serial}` : "Entry code"}>
              {r
                ? qrCells(r.serial).map(([x, y]) => <rect key={`${x}-${y}`} x={x + 0.08} y={y + 0.08} width={0.84} height={0.84} />)
                : null}
            </svg>
            <span className={"slip__stamp" + (f?.stampMuted ? " slip__stamp--pending" : "")} id="t-stamp" hidden={!f}>
              {f ? f.stamp : ""}
            </span>
          </div>
        </article>

        <div className="slip-actions">
          <p className="slip-actions__error" id="t-error" role="alert">
            {error}
          </p>
          <button className="btn btn--primary btn--block" type="button" id="save-ticket" disabled={!r || saving} onClick={onSave}>
            Save ticket
          </button>
          <p className="slip-actions__links">
            <a className="link" href="reservations.html">
              View all reservations
            </a>
            <span className="appbar__dot" aria-hidden="true">
              ·
            </span>
            <a className="link" href="home.html">
              Back to home
            </a>
          </p>
          <p className="slip-actions__small" id="t-small">
            {r ? smallPrint(r) : "Show this ticket at entry. The attendant will verify your plate."}
          </p>
        </div>
      </main>
    </>
  );
}

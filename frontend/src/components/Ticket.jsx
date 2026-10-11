import { rwf, windowLabel } from "../lib/format.js";
import Qr from "./Qr.jsx";

/** The driver's upcoming ticket, as shown on the home page. */
export default function Ticket({ r }) {
  const serial = "№ " + r.serial;
  const rows = [
    ["Facility", (r.facility + " · Level " + r.level).toUpperCase()],
    ["Window", windowLabel(r.start, r.end)],
    ["Duration", r.duration],
    ["Plate", r.plate],
    ["Amount", rwf(r.amount), "ticket__amount"],
  ];

  return (
    <article className="ticket" aria-label={"Reservation ticket " + serial}>
      <div className="ticket__stub">
        <span className="ticket__serial">{serial}</span>
      </div>
      <div className="ticket__body">
        <div className="ticket__slot">
          <span className="ticket__label">Slot</span>
          <span className="ticket__slot-no">{r.slot}</span>
        </div>
        <dl className="ticket__spec">
          {rows.map(([label, value, cls]) => (
            <Row key={label} label={label} value={value} cls={cls} />
          ))}
        </dl>
        <div className="ticket__qr">
          <Qr seed={r.serial} label={"Entry code for ticket " + serial} />
          <span className="ticket__qr-caption">{serial}</span>
        </div>
      </div>
      <span className="ticket__stamp" aria-hidden="true">
        {r.display === "Paid" ? "Paid" : "Confirmed"}
      </span>
    </article>
  );
}

// <dt>/<dd> have to be siblings inside the <dl>, so the pair is a fragment.
function Row({ label, value, cls }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={cls}>{value}</dd>
    </>
  );
}

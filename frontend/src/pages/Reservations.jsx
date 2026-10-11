import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import AppBar from "../components/AppBar.jsx";
import OfflineBanner from "../components/OfflineBanner.jsx";
import StatusPill from "../components/StatusPill.jsx";
import { api } from "../lib/api.js";
import { count2, pad2, rwf } from "../lib/format.js";

const STAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

const stamp = (iso) => iso.replace("T", " ");

function windowText(r) {
  const s = r.start.split("T");
  const e = r.end.split("T");
  return `${s[0]} ${s[1]} → ${s[0] === e[0] ? e[1] : e[0] + " " + e[1]}`;
}

export default function Reservations() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [openSerial, setOpenSerial] = useState(null);
  const [confirming, setConfirming] = useState(null);
  // serial -> note shown after an action; cleared by the next load
  const [notes, setNotes] = useState({});
  const pendingNotes = useRef({});

  const load = useCallback(
    () =>
      api("/api/reservations")
        .then((d) => {
          setData(d);
          setNotes(pendingNotes.current);
          pendingNotes.current = {};
        })
        .catch((err) => setError(err.message)),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  const upcoming = data?.upcoming || [];
  const past = data?.past || [];

  return (
    <>
      <AppBar active="reservations" />
      <OfflineBanner />

      <main className="mine" id="mine" aria-busy={data ? undefined : "true"}>
        <h1 className="sr-only">My reservations</h1>

        <section aria-labelledby="upcoming-label">
          <h2 className="section-label" id="upcoming-label">
            <span>Upcoming</span>
            <span className="section-label__count" id="upcoming-count">
              {count2(upcoming.length)}
            </span>
          </h2>
          <ol className="rstubs" id="upcoming-list" hidden={!!data && !upcoming.length}>
            {upcoming.map((r) => (
              <Stub
                key={r.serial}
                r={r}
                note={notes[r.serial]}
                open={openSerial === r.serial}
                confirming={confirming === r.serial}
                onReschedule={() => {
                  setConfirming(null);
                  setOpenSerial((s) => (s === r.serial ? null : r.serial));
                }}
                onAskCancel={() => {
                  setOpenSerial(null);
                  setConfirming(r.serial);
                }}
                onKeep={() => setConfirming(null)}
                onDone={(note) => {
                  if (note) pendingNotes.current[r.serial] = note;
                  setOpenSerial(null);
                  setConfirming(null);
                  return load();
                }}
              />
            ))}
          </ol>
          <p className="empty" id="upcoming-empty" hidden={!data || !!upcoming.length}>
            No upcoming reservations.{" "}
            <a className="link" href="browse.html">
              Browse facilities
            </a>
          </p>
        </section>

        <section id="past" aria-labelledby="past-label">
          <h2 className="section-label" id="past-label">
            <span>Past</span>
            <span className="section-label__count" id="past-count">
              {count2(past.length)}
            </span>
          </h2>
          <div className="table-wrap">
            <table className="table table--past" id="past-table" hidden={!past.length}>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Slot</th>
                  <th scope="col">Facility</th>
                  <th scope="col" className="num">
                    Amount
                  </th>
                  <th scope="col" className="col-status">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody id="past-body">
                {past.map((r) => (
                  <PastRow key={r.serial} r={r} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="empty" id="past-empty" hidden={!!past.length}>
            No past reservations yet.
          </p>
        </section>

        <p className="empty error-text" id="load-error" role="alert" hidden={!error}>
          {error}
        </p>
      </main>
    </>
  );
}

function PastRow({ r }) {
  const href = "ticket.html?serial=" + encodeURIComponent(r.serial);
  return (
    <tr onClick={(e) => !e.target.closest("a") && window.location.assign(href)}>
      <td className="mono">
        <time dateTime={r.date}>{r.date}</time>
      </td>
      <td>
        <a className="table__name table__slot" href={href} aria-label={`Slot ${r.slot}, ticket № ${r.serial}`}>
          {r.slot}
        </a>
      </td>
      <td>
        {r.facility} <span className="stub__level">{"· " + r.level}</span>
      </td>
      <td className="num">{rwf(r.amount)}</td>
      <td className="col-status">
        <StatusPill status={r.display} />
      </td>
    </tr>
  );
}

function Stub({ r, note, open, confirming, onReschedule, onAskCancel, onKeep, onDone }) {
  const [cancelling, setCancelling] = useState(false);

  async function confirmCancel() {
    setCancelling(true);
    try {
      await api(`/api/reservations/${r.serial}/cancel`, { method: "POST" });
      await onDone(null);
    } catch (err) {
      setCancelling(false);
      await onDone({ text: err.message, error: true });
    }
  }

  return (
    <li className="rstub" data-serial={r.serial}>
      <div className="rstub__main">
        <a
          className="rstub__slot"
          href={"ticket.html?serial=" + encodeURIComponent(r.serial)}
          aria-label={`Slot ${r.slot}, open ticket № ${r.serial}`}
        >
          {r.slot}
        </a>
        <div className="rstub__info">
          <span className="rstub__where">{(r.facility + " · Level " + r.level).toUpperCase()}</span>
          <span className="rstub__window">{windowText(r)}</span>
          <span className="rstub__plate">{r.plate}</span>
        </div>
        <div className="rstub__side">
          <StatusPill status={r.display} />
          <p className="rstub__links">
            {confirming ? (
              <>
                <span className="rstub__ask">{`Cancel № ${r.serial}?`}</span>
                <button type="button" className="linkbtn linkbtn--danger" disabled={cancelling} autoFocus onClick={confirmCancel}>
                  {cancelling ? "Yes, cancel…" : "Yes, cancel"}
                </button>
                <Dot />
                <button type="button" className="linkbtn" onClick={onKeep}>
                  Keep it
                </button>
              </>
            ) : (
              <Links r={r} onReschedule={onReschedule} onAskCancel={onAskCancel} />
            )}
          </p>
          {note ? (
            <p className={"rstub__note" + (note.error ? " error-text" : "")} role="status">
              {note.text}
            </p>
          ) : null}
        </div>
      </div>

      <div className="rstub__drawer" data-open={String(open)} inert={open ? undefined : ""}>
        {open ? (
          <div className="rstub__drawer-inner">
            <Reschedule r={r} onClose={onReschedule} onDone={onDone} />
          </div>
        ) : null}
      </div>
    </li>
  );
}

function Dot() {
  return (
    <span className="rstub__dot" aria-hidden="true">
      ·
    </span>
  );
}

function Links({ r, onReschedule, onAskCancel }) {
  const items = [];
  if (r.can.pay) {
    items.push(
      <a className="link" href={"pay.html?serial=" + encodeURIComponent(r.serial)} key="pay">
        Pay
      </a>,
    );
  }
  if (r.can.reschedule) {
    items.push(
      <button type="button" className="linkbtn js-reschedule" key="resched" onClick={onReschedule}>
        Reschedule
      </button>,
    );
  }
  if (r.can.cancel) {
    items.push(
      <button type="button" className="linkbtn" key="cancel" onClick={onAskCancel}>
        Cancel
      </button>,
    );
  }
  return items.map((node, i) => (
    <Fragment key={node.key}>
      {i ? <Dot /> : null}
      {node}
    </Fragment>
  ));
}

function Reschedule({ r, onClose, onDone }) {
  const ids = { start: "start-" + r.serial, end: "end-" + r.serial, status: "status-" + r.serial };
  const [start, setStart] = useState(stamp(r.start));
  const [end, setEnd] = useState(stamp(r.end));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const first = useRef(null);
  const paid = r.payment.status === "Paid";

  useEffect(() => {
    first.current?.focus();
    first.current?.select();
  }, []);

  // Keep the length when the start moves on a paid reservation.
  function onStartBlur() {
    if (!paid) return;
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(start.trim());
    if (!m) return;
    const lengthMin = (Date.parse(r.end) - Date.parse(r.start)) / 60000;
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5] + lengthMin);
    setEnd(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
  }

  async function onSubmit(event) {
    event.preventDefault();
    setErrors({});
    setFormError("");

    // Format check here; every other rule is the server's.
    const bad = !STAMP_RE.test(start.trim()) ? "start" : !STAMP_RE.test(end.trim()) ? "end" : null;
    if (bad) {
      setErrors({ [bad]: "Use the format yyyy-MM-dd HH:mm." });
      document.getElementById(ids[bad])?.focus();
      return;
    }

    setSaving(true);
    try {
      const res = await api(`/api/reservations/${r.serial}`, {
        method: "PATCH",
        body: { start: start.trim(), end: end.trim() },
      });
      const updated = res.reservation;
      let moved = "Rescheduled to " + windowText(updated) + ".";
      if (updated.amount !== r.amount) moved += " New amount " + rwf(updated.amount) + ".";
      await onDone({ text: moved });
    } catch (err) {
      setSaving(false);
      const field = err.data?.field;
      if (field === "start" || field === "end") {
        setErrors({ [field]: err.message });
        document.getElementById(ids[field])?.focus();
      } else {
        setFormError(err.message);
      }
    }
  }

  return (
    <form
      className="resched"
      noValidate
      aria-label={`Reschedule № ${r.serial}`}
      onSubmit={onSubmit}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <p className="resched__label">{`Reschedule № ${r.serial}`}</p>
      <div className="resched__fields">
        <Field
          id={ids.start}
          name="start"
          label="Start"
          value={start}
          error={errors.start}
          helpId={"resched-help-" + r.serial}
          inputRef={first}
          onBlur={onStartBlur}
          onChange={(v) => {
            setStart(v);
            setErrors({});
            setFormError("");
          }}
        />
        <Field
          id={ids.end}
          name="end"
          label="End"
          value={end}
          error={errors.end}
          helpId={"resched-help-" + r.serial}
          onChange={(v) => {
            setEnd(v);
            setErrors({});
            setFormError("");
          }}
        />
        <div className="resched__field">
          <label className="resched__fieldlabel" htmlFor={ids.status}>
            Status
          </label>
          <input
            className="input mono input--locked"
            id={ids.status}
            value={r.status}
            readOnly
            aria-readonly="true"
            tabIndex={-1}
          />
        </div>
      </div>
      <p className="resched__help" id={"resched-help-" + r.serial}>
        Format: yyyy-MM-dd HH:mm{paid ? " · Paid: keep the same length" : ""}
      </p>
      <p className="resched__error" role="alert">
        {formError}
      </p>
      <div className="resched__buttons">
        <button className="btn btn--primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button className="btn btn--secondary" type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({ id, name, label, value, error, helpId, inputRef, onChange, onBlur }) {
  return (
    <div className="resched__field">
      <label className="resched__fieldlabel" htmlFor={id}>
        {label}
      </label>
      <input
        className="input mono"
        id={id}
        name={name}
        ref={inputRef}
        value={value}
        autoComplete="off"
        spellCheck="false"
        aria-describedby={`${id}-error ${helpId}`}
        aria-invalid={error ? "true" : undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      <span className="field__error" id={`${id}-error`}>
        {error || ""}
      </span>
    </div>
  );
}

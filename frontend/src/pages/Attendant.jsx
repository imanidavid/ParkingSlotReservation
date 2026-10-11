import { useCallback, useEffect, useRef, useState } from "react";
import AppBar from "../components/AppBar.jsx";
import OfflineBanner from "../components/OfflineBanner.jsx";
import StatusPill from "../components/StatusPill.jsx";
import { api } from "../lib/api.js";
import { usePoll } from "../lib/hooks.js";
import { count2, rwf } from "../lib/format.js";

const REFRESH_MS = 30000;

const fmtMinutes = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return ((h ? h + " h " : "") + (m ? m + " min" : "")).trim();
};

const timeOf = (iso) => new Date(iso).toTimeString().slice(0, 5);

export default function Attendant() {
  const [mode, setMode] = useState("plate"); // or "slot"
  const [value, setValue] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [match, setMatch] = useState(null);
  const [miss, setMiss] = useState("");
  const [actionError, setActionError] = useState("");

  const [today, setToday] = useState(null);
  const [todayError, setTodayError] = useState("");
  const [board, setBoard] = useState(null);
  const [boardError, setBoardError] = useState("");
  const [focusSlot, setFocusSlot] = useState(null);

  const input = useRef(null);

  const refresh = useCallback(() => {
    api("/api/attendant/board")
      .then((b) => {
        setBoard(b);
        setBoardError("");
      })
      .catch((err) => setBoardError(err.message));
    api("/api/attendant/today")
      .then((res) => {
        setToday(res.reservations);
        setTodayError("");
      })
      .catch((err) => setTodayError(err.message));
  }, []);

  useEffect(refresh, [refresh]);
  usePoll(refresh, REFRESH_MS);

  function switchMode() {
    setMode((m) => (m === "plate" ? "slot" : "plate"));
    setValue("");
    setLookupError("");
    setMatch(null);
    setMiss("");
    input.current?.focus();
  }

  async function onVerify(event) {
    event.preventDefault();
    const typed = value.trim();
    if (!typed) {
      setLookupError(mode === "plate" ? "Enter a plate number." : "Enter a slot, e.g. B1 A1.");
      input.current?.focus();
      return;
    }

    setVerifying(true);
    setActionError("");
    try {
      const res = await api(`/api/attendant/verify?${new URLSearchParams({ [mode]: typed })}`);
      setMatch(res.reservation);
      setMiss("");
      setFocusSlot({ level: res.reservation.level, slot: res.reservation.slot });
    } catch (err) {
      setFocusSlot(null);
      setMatch(null);
      if (err.status === 404) setMiss(err.message);
      else setLookupError(err.message);
    }
    setVerifying(false);
  }

  /** Every desk action is the same POST; the reply is the updated reservation. */
  const act = useCallback(
    async (serial, kind) => {
      setActionError("");
      try {
        const res = await api(`/api/attendant/reservations/${serial}/${kind}`, { method: "POST" });
        // keep the verify panel in step if it shows this reservation
        setMatch((m) => (m && m.serial === serial ? res.reservation : m));
        refresh();
      } catch (err) {
        setActionError(err.message);
        throw err;
      }
    },
    [refresh],
  );

  return (
    <>
      <AppBar nav="attendant" active="verify" />
      <OfflineBanner />

      <main className="desk">
        <h1 className="sr-only">Attendant desk</h1>

        <section id="verify" aria-labelledby="verify-label">
          <h2 className="section-label" id="verify-label">
            Verify reservation
          </h2>

          <form className="lookup" id="lookup" noValidate onSubmit={onVerify}>
            <label className="lookup__label" htmlFor="lookup-input" id="lookup-label">
              {mode === "plate" ? "Plate number" : "Slot number"}
            </label>
            <input
              className="lookup__input"
              id="lookup-input"
              name={mode}
              ref={input}
              placeholder={mode === "plate" ? "RAD 482 C" : "B1 A1"}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck="false"
              aria-describedby="lookup-error"
              aria-invalid={lookupError ? "true" : undefined}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setLookupError("");
              }}
            />
            <span className="field__error" id="lookup-error">
              {lookupError}
            </span>
            <div className="lookup__actions">
              <button className="btn btn--primary lookup__btn" type="submit" id="lookup-btn" disabled={verifying}>
                {verifying ? "Verifying…" : "Verify"}
              </button>
              <button className="linkbtn lookup__mode" type="button" id="lookup-mode" onClick={switchMode}>
                {mode === "plate" ? "Search by slot number instead" : "Search by plate instead"}
              </button>
            </div>
          </form>

          <div className="result" id="result" aria-live="polite">
            {match ? <VTicket r={match} act={act} /> : null}
            {miss ? (
              <div className="miss">
                <p className="miss__text">{miss}</p>
                <button className="linkbtn" type="button" onClick={switchMode}>
                  {mode === "plate" ? "Search by slot number instead" : "Search by plate instead"}
                </button>
              </div>
            ) : null}
            {actionError ? (
              <p className="result__error" role="alert">
                {actionError}
              </p>
            ) : null}
          </div>
        </section>

        <Today list={today} error={todayError} act={act} />
        <Board board={board} error={boardError} focusSlot={focusSlot} />
      </main>
    </>
  );
}

// ---- the verify panel ------------------------------------------------------

function VTicket({ r, act }) {
  const paid = r.payment.status === "Paid";
  const s = r.start.split("T");
  const e = r.end.split("T");

  const spec = [
    ["Facility", (r.facility + " · Level " + r.level).toUpperCase()],
    ["Window", `${s[0]} ${s[1]} → ${e[1]}`],
    ["Plate", r.plate],
    ["Vehicle", (r.vehicle || "—").toUpperCase()],
    ["Amount", rwf(r.amount)],
    ["Method", (r.payment.method || "—").toUpperCase()],
  ];

  let note = "";
  if (r.releasedAt) note = `Car left at ${timeOf(r.releasedAt)}. The slot is free again.`;
  else if (r.checkedInAt) note = `Marked occupied at ${timeOf(r.checkedInAt)}.`;
  else if (!paid) note = `Not paid. Collect ${rwf(r.amount)} before entry.`;
  else if (r.startsIn > 0) note = `Starts at ${s[1]} (in ${fmtMinutes(r.startsIn)}). Early arrival is fine.`;

  const stamp = r.releasedAt ? "Left" : r.checkedInAt ? "Occupied" : paid ? "Paid" : "Unpaid";

  const actions = [];
  if (r.releasedAt) {
    /* nothing left to do */
  } else if (r.checkedInAt) {
    actions.push({ kind: "release", label: "Release slot", busy: "Releasing…", cls: "btn btn--secondary" });
  } else {
    actions.push({
      kind: "occupy",
      label: "Mark as occupied",
      busy: "Marking…",
      cls: "btn btn--primary",
      disabled: !paid,
    });
    if (!paid) actions.push({ kind: "cash", label: "Record cash payment", busy: "Recording…", cls: "linkbtn" });
  }

  return (
    <article className="vticket" aria-label={`Reservation № ${r.serial}`}>
      <div className="vticket__stub">
        <span className="vticket__serial">{"№ " + r.serial}</span>
      </div>
      <div className="vticket__body">
        <div className="vticket__head">
          <span className="vticket__label">Slot</span>
          <p className="vticket__slot">{r.slot}</p>
        </div>
        <dl className="vticket__spec">
          {spec.map(([k, v]) => (
            <SpecRow key={k} label={k} value={v} />
          ))}
        </dl>
        {note ? (
          <p className="vticket__note" role="status">
            {note}
          </p>
        ) : null}
        {actions.length ? (
          <div className="vticket__actions">
            {actions.map((a) => (
              <ActionButton key={a.kind} serial={r.serial} act={act} {...a} />
            ))}
          </div>
        ) : null}
      </div>
      <span className={"vticket__stamp vticket__stamp--" + stamp.toLowerCase()} aria-hidden="true">
        {stamp}
      </span>
    </article>
  );
}

function SpecRow({ label, value }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function ActionButton({ serial, kind, label, busy, cls, disabled, act }) {
  const [working, setWorking] = useState(false);
  return (
    <button
      className={cls}
      type="button"
      disabled={disabled || working}
      onClick={async () => {
        setWorking(true);
        try {
          await act(serial, kind);
        } catch {
          setWorking(false);
        }
      }}
    >
      {working ? busy : label}
    </button>
  );
}

// ---- today at this facility -------------------------------------------------

function Today({ list, error, act }) {
  const rows = list || [];
  return (
    <section id="today" aria-labelledby="today-label">
      <h2 className="section-label" id="today-label">
        <span>Today at this facility</span>
        <span className="section-label__count" id="today-count">
          {count2(rows.length)}
        </span>
      </h2>
      <div className="table-wrap">
        <table className="table table--today" id="today-table" hidden={!rows.length}>
          <thead>
            <tr>
              <th scope="col">Window</th>
              <th scope="col">Slot</th>
              <th scope="col">Plate</th>
              <th scope="col">Payment</th>
              <th scope="col">State</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody id="today-body">
            {rows.map((r) => (
              <TodayRow key={r.serial} r={r} act={act} />
            ))}
          </tbody>
        </table>
      </div>
      <p className={"empty" + (error ? " error-text" : "")} id="today-empty" hidden={!!rows.length && !error}>
        {error || "No reservations today at this facility."}
      </p>
    </section>
  );
}

function TodayRow({ r, act }) {
  const paid = r.payment.status === "Paid";
  const actions = [];
  if (r.state === "Due" || r.state === "Late") {
    actions.push(
      paid
        ? { kind: "occupy", label: "Mark occupied", cls: "linkbtn" }
        : { kind: "cash", label: "Record cash", cls: "linkbtn" },
    );
    if (r.canNoShow) actions.push({ kind: "no-show", label: "No-show", cls: "linkbtn linkbtn--danger" });
  }
  if (r.state === "Parked") actions.push({ kind: "release", label: "Release", cls: "linkbtn" });

  return (
    <tr data-serial={r.serial}>
      <td className="mono">{r.start.split("T")[1] + "→" + r.end.split("T")[1]}</td>
      <td className="mono">{r.level + " " + r.slot}</td>
      <td className="mono">{r.plate}</td>
      <td>
        <StatusPill status={paid ? "Paid" : "Unpaid"} />
      </td>
      <td className={"today__state today__state--" + r.state.toLowerCase().replace(/[^a-z]+/g, "-")}>{r.state}</td>
      <td className="today__actions">
        {actions.map((a, i) => (
          <span key={a.kind}>
            {i ? (
              <span className="rstub__dot" aria-hidden="true">
                ·
              </span>
            ) : null}
            <ActionButton serial={r.serial} act={act} busy={a.label + "…"} {...a} />
          </span>
        ))}
      </td>
    </tr>
  );
}

// ---- live board -------------------------------------------------------------

function Board({ board, error, focusSlot }) {
  const counts = board
    ? `AVAILABLE ${board.counts.Available} · RESERVED ${board.counts.Reserved} · OCCUPIED ${board.counts.Occupied}` +
      (board.counts.Inactive ? ` · OUT OF SERVICE ${board.counts.Inactive}` : "")
    : " ";

  return (
    <section id="board" aria-labelledby="board-label">
      <h2 className="section-label" id="board-label">
        <span>
          Live board <span id="board-facility">{board ? "· " + board.facility.name : ""}</span>
        </span>
        <span className="section-label__count" id="board-asof">
          {board ? "As of " + board.asOf : ""}
        </span>
      </h2>
      <p className="board__counts" id="board-counts" aria-live="polite">
        {error || counts}
      </p>
      <div className="board" id="board-levels" aria-label="Slots by status">
        {(board?.levels || []).map((level) => (
          <div className="board__level" data-level={level.name} key={level.name}>
            <p className="board__levelname">{"Level " + level.name}</p>
            <div className="board__grid" role="list" style={{ "--cols": level.cols }}>
              {level.rows.flatMap((row, r) =>
                row.slots.map((s) => (
                  <span
                    key={s.id}
                    className={
                      "bcell bcell--" +
                      s.status.toLowerCase() +
                      (focusSlot && focusSlot.level === level.name && focusSlot.slot === s.id ? " bcell--focus" : "")
                    }
                    role="listitem"
                    data-slot={s.id}
                    // place by row and slot number so gaps stay visible
                    style={{ gridRow: String(r + 1), gridColumn: String(s.col || "auto") }}
                    aria-label={`${level.name} ${s.id}, ${s.status === "Inactive" ? "out of service" : s.status.toLowerCase()}`}
                  >
                    {s.id}
                  </span>
                )),
              )}
            </div>
          </div>
        ))}
      </div>
      <ul className="legend board__legend" aria-label="Legend">
        <li className="legend__item">
          <span className="legend__swatch bcell--available" aria-hidden="true" />
          Available
        </li>
        <li className="legend__item">
          <span className="legend__swatch bcell--reserved" aria-hidden="true" />
          Reserved
        </li>
        <li className="legend__item">
          <span className="legend__swatch bcell--occupied" aria-hidden="true" />
          Occupied
        </li>
        <li className="legend__item">
          <span className="legend__swatch bcell--inactive" aria-hidden="true" />
          Out of service
        </li>
      </ul>
      <p className="sample-note" id="board-sample" hidden={!board?.sampleTraffic}>
        Includes sample traffic for demonstration.
      </p>
    </section>
  );
}

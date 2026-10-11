import { Fragment, useEffect, useRef, useState } from "react";
import AppBar from "../components/AppBar.jsx";
import OfflineBanner from "../components/OfflineBanner.jsx";
import { api, me } from "../lib/api.js";
import { cleanPlate, num, rwf } from "../lib/format.js";

const FACILITY_ID = new URLSearchParams(window.location.search).get("id") || "";

function initialQuery() {
  const p = new URLSearchParams(window.location.search);
  return {
    level: p.get("level") || "",
    date: p.get("date") || "",
    duration: p.get("duration") || "1h",
    start: p.get("start") || "",
    vehicle: p.get("vehicle") || "",
  };
}

export default function Facility() {
  // `query` is what the driver asked for; `detail` is what the server resolved
  // it to (it moves the start time past closing, picks a default level, …).
  // Rendering always reads `detail`, so the two never fight.
  const [query, setQuery] = useState(initialQuery);
  const [detail, setDetail] = useState(null);
  const [slot, setSlot] = useState(null);
  const [plate, setPlate] = useState("");
  const [plateError, setPlateError] = useState("");
  const [vehicleError, setVehicleError] = useState("");
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const requestId = useRef(0);

  // Prefill plate and vehicle from the account; both can be changed per booking.
  useEffect(() => {
    if (!FACILITY_ID) {
      window.location.replace("browse.html");
      return;
    }
    let live = true;
    me()
      .then((m) => {
        if (!live) return;
        setPlate((p) => p || m.plate || "");
        setQuery((q) => (q.vehicle ? q : { ...q, vehicle: m.vehicle || "Car" }));
      })
      .catch(() => live && setQuery((q) => (q.vehicle ? q : { ...q, vehicle: "Car" })))
      .finally(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const id = ++requestId.current;
    const q = new URLSearchParams({ duration: query.duration });
    ["level", "date", "start", "vehicle"].forEach((k) => query[k] && q.set(k, query[k]));

    api(`/api/facilities/${encodeURIComponent(FACILITY_ID)}?${q}`)
      .then((d) => {
        if (id !== requestId.current) return;
        setDetail(d);
        setSlot((current) => reconcile(current, d, setError));
      })
      .catch((err) => {
        if (id !== requestId.current) return;
        if (err.status === 404) setMissing(true);
        else setError(err.message);
      });
  }, [ready, query]);

  // State lives in the URL, so a chosen bay and window survive a reload.
  useEffect(() => {
    if (!detail) return;
    document.title = detail.facility.name + " · Karita";
    const q = new URLSearchParams({ id: FACILITY_ID });
    if (detail.facility.levels.length > 1) q.set("level", detail.level);
    if (detail.date !== detail.minDate) q.set("date", detail.date);
    if (detail.duration !== "1h") q.set("duration", detail.duration);
    if (detail.start && detail.start !== detail.startTimes[0]) q.set("start", detail.start);
    if (detail.vehicle) q.set("vehicle", detail.vehicle);
    history.replaceState(null, "", "facility.html?" + q);
  }, [detail]);

  function change(patch, { keepSlot = false } = {}) {
    setError("");
    if (!keepSlot) setSlot(null);
    setQuery((q) => ({ ...q, ...patch }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!slot || !detail || submitting) return;

    const clean = cleanPlate(plate);
    if (!clean) {
      setPlateError("Enter the vehicle plate, e.g. RAD 482 C.");
      document.getElementById("plate")?.focus();
      return;
    }
    setPlate(clean);
    setSubmitting(true);
    setError("");

    try {
      const res = await api("/api/reservations", {
        method: "POST",
        body: {
          facilityId: FACILITY_ID,
          level: detail.level,
          slot,
          date: detail.date,
          start: detail.start,
          duration: detail.duration,
          plate: clean,
          vehicle: detail.vehicle,
        },
      });
      window.location.assign("pay.html?serial=" + encodeURIComponent(res.reservation.serial));
    } catch (err) {
      setSubmitting(false);
      const field = err.data?.field;
      if (field === "plate") {
        setPlateError(err.message);
        document.getElementById("plate")?.focus();
      } else if (field === "vehicle") {
        setVehicleError(err.message);
        document.getElementById("vehicle")?.focus();
      } else {
        setError(err.message);
      }
      // 409 means somebody else took the bay between picking and posting.
      if (err.status === 409) {
        setSlot(null);
        setQuery((q) => ({ ...q }));
      }
    }
  }

  if (missing) {
    return (
      <>
        <AppBar active="browse" />
        <OfflineBanner />
        <main className="facility" id="facility">
          <header className="facility__head">
            <a className="facility__back link" href="browse.html">
              ← All facilities
            </a>
            <div className="facility__titles">
              <h1 className="facility__name" id="facility-name">
                Facility not found
              </h1>
              <p className="facility__sub" id="facility-sub" />
            </div>
          </header>
          <p className="empty">
            This facility doesn't exist or was removed.{" "}
            <a className="link" href="browse.html">
              Browse facilities
            </a>
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <AppBar active="browse" />
      <OfflineBanner />

      <main className="facility" id="facility" aria-busy={detail ? undefined : "true"}>
        <header className="facility__head">
          <a className="facility__back link" href="browse.html">
            ← All facilities
          </a>
          <div className="facility__titles">
            <h1 className="facility__name" id="facility-name">
              {detail ? detail.facility.name : " "}
            </h1>
            <p className="facility__sub" id="facility-sub">
              {detail ? (detail.facility.name + " · Level " + detail.level).toUpperCase() : " "}
            </p>
          </div>
          <div className="levels" id="levels" role="group" aria-label="Level" hidden={!detail || detail.facility.levels.length < 2}>
            <span className="levels__label">Level</span>
            {(detail?.facility.levels || []).map((name, i) => (
              <Fragment key={name}>
                {i ? <span aria-hidden="true">/</span> : null}
                <button
                  type="button"
                  aria-pressed={String(name === detail.level)}
                  onClick={() => name !== detail.level && change({ level: name })}
                >
                  {name}
                </button>
              </Fragment>
            ))}
          </div>
        </header>

        <div className="facility__body" id="picker">
          <Lot detail={detail} slot={slot} vehicle={detail?.vehicle} onPick={(id) => {
            setError("");
            setSlot((s) => (s === id ? null : id));
          }} />

          <form className="panel" id="reserve-form" noValidate onSubmit={onSubmit}>
            <div className="panel__block">
              <span className="panel__label" id="selected-label">
                Selected slot
              </span>
              <p
                className={"panel__slot" + (slot ? "" : " panel__slot--empty")}
                id="selected-slot"
                aria-labelledby="selected-label"
                aria-live="polite"
              >
                {slot || "—"}
              </p>
            </div>

            <fieldset className="panel__block">
              <legend className="panel__label">Duration</legend>
              <div className="chips chips--durations" id="durations">
                {(detail?.durations || []).map((d) => (
                  <Fragment key={d.id}>
                    <input
                      type="radio"
                      name="duration"
                      value={d.id}
                      id={"dur-" + d.id}
                      className="chip__input"
                      checked={detail.duration === d.id}
                      onChange={() => change({ duration: d.id })}
                    />
                    <label className="chip" htmlFor={"dur-" + d.id}>
                      {d.label}
                    </label>
                  </Fragment>
                ))}
              </div>
            </fieldset>

            <div className="panel__block">
              <label className="panel__label" htmlFor="date">
                Date
              </label>
              <input
                className="input"
                type="date"
                id="date"
                name="date"
                required
                min={detail?.minDate}
                max={detail?.maxDate}
                value={detail?.date || ""}
                onChange={(e) => e.target.value && change({ date: e.target.value })}
              />
            </div>

            <div className="panel__block">
              <label className="panel__label" htmlFor="start">
                Start time
              </label>
              <div className="select">
                <select
                  className="input mono"
                  id="start"
                  name="start"
                  disabled={!detail || detail.duration === "day" || !detail.startTimes.length}
                  value={detail?.start || ""}
                  onChange={(e) => change({ start: e.target.value }, { keepSlot: true })}
                >
                  {detail && !detail.startTimes.length ? <option value="">No times left</option> : null}
                  {(detail?.startTimes || []).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <span className="select__caret" aria-hidden="true">
                  ▾
                </span>
              </div>
            </div>

            <div className="panel__pair">
              <div className="panel__block">
                <label className="panel__label" htmlFor="plate">
                  Plate
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
                  aria-invalid={plateError ? "true" : undefined}
                  value={plate}
                  onChange={(e) => {
                    setPlate(e.target.value);
                    setPlateError("");
                  }}
                />
                <span className="field__error" id="plate-error">
                  {plateError}
                </span>
              </div>
              <div className="panel__block">
                <label className="panel__label" htmlFor="vehicle">
                  Vehicle
                </label>
                <div className="select">
                  <select
                    className="input mono"
                    id="vehicle"
                    name="vehicle"
                    aria-describedby="vehicle-error"
                    aria-invalid={vehicleError ? "true" : undefined}
                    value={detail?.vehicle || ""}
                    onChange={(e) => {
                      setVehicleError("");
                      change({ vehicle: e.target.value });
                    }}
                  >
                    {(detail?.vehicleTypes || []).map((v) => (
                      <option key={v} value={v}>
                        {v.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <span className="select__caret" aria-hidden="true">
                    ▾
                  </span>
                </div>
                <span className="field__error" id="vehicle-error">
                  {vehicleError}
                </span>
              </div>
            </div>

            <hr className="rule" />

            <Price detail={detail} />

            <p className="panel__error" id="reserve-error" role="alert">
              {error}
            </p>

            <button
              className="btn btn--primary btn--block"
              type="submit"
              id="reserve-btn"
              disabled={submitting || !slot || !detail?.start}
            >
              {submitting ? "Reserving…" : "Reserve slot"}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}

/** Keep the chosen bay only if it's still free and still fits the vehicle. */
function reconcile(current, d, setError) {
  if (!current) return null;
  const found = d.rows.flatMap((r) => r.slots).find((s) => s.id === current);
  if (!found || found.status !== "Available") {
    setError(`${current} is taken for that time. Pick another slot.`);
    return null;
  }
  if (!found.fits) {
    setError(`${current} is a ${found.vehicleType.toLowerCase()} bay; pick one that fits your vehicle.`);
    return null;
  }
  return current;
}

function Price({ detail }) {
  const d = detail?.durations.find((x) => x.id === detail.duration);
  return (
    <>
      <div className="panel__price">
        <span className="panel__label">Rate</span>
        <span className="panel__amount" id="amount">
          {d ? rwf(d.price) : "—"}
        </span>
      </div>
      <p className="panel__calc" id="calc">
        {!d
          ? ""
          : detail.duration === "day"
            ? `FULL DAY 06:00 → 22:00 · BILLED AS 8H × ${num(detail.facility.rate)} RWF`
            : `${d.label} × ${num(detail.facility.rate)} RWF/H`}
      </p>
    </>
  );
}

function Lot({ detail, slot, vehicle, onPick }) {
  const counts = { Available: 0, Reserved: 0, Occupied: 0, Inactive: 0, NoFit: 0 };
  (detail?.rows || []).forEach((row) =>
    row.slots.forEach((s) => {
      if (s.status === "Available" && !s.fits) counts.NoFit++;
      else counts[s.status]++;
    }),
  );

  const legend = [
    ["available", "Available", counts.Available],
    ["reserved", "Reserved", counts.Reserved],
    ["occupied", "Occupied", counts.Occupied],
  ];
  if (counts.NoFit) legend.push(["nofit", "Too small for a " + (vehicle || "vehicle").toLowerCase(), counts.NoFit]);
  if (counts.Inactive) legend.push(["inactive", "Out of service", counts.Inactive]);

  const empty = detail && !detail.rows.length;

  return (
    <section className="lot" aria-labelledby="lot-label">
      <div className="lot__head">
        <h2 className="lot__label" id="lot-label">
          The lot
        </h2>
        <p className="lot__window" id="lot-window" aria-live="polite">
          {detail && detail.rows.length ? `${detail.date} ${detail.window.start} → ${detail.window.end}` : ""}
        </p>
      </div>

      <div className="lot__scroll">
        <div className="lot__grid" id="lot-grid" style={detail ? { "--cols": detail.cols } : undefined}>
          {empty ? (
            <p className="empty">
              {detail.window ? "This level has no slots yet." : "No start times left for this day. Pick another date."}
            </p>
          ) : null}
          {(detail?.rows || []).map((row, i) => (
            <Fragment key={row.row}>
              {i && i % 2 === 0 ? (
                <div className="lot__aisle" aria-hidden="true">
                  <span>Aisle</span>
                </div>
              ) : null}
              <div className="lot__row" role="group" aria-label={"Row " + row.row}>
                <span className="lot__rowlabel" aria-hidden="true">
                  {row.row}
                </span>
                {row.slots.map((s) => (
                  <Cell key={s.id} s={s} selected={s.id === slot} onPick={onPick} />
                ))}
              </div>
            </Fragment>
          ))}
        </div>
      </div>

      {/* Only once there is data: the swatches carry the same cell--* classes
          as the bays, so an empty legend would otherwise look like a free bay
          to anything selecting on them. */}
      <ul className="legend" id="legend" aria-label="Legend">
        {detail
          ? legend.map(([key, label, n]) => (
              <li className="legend__item" key={key}>
                <span className={"legend__swatch cell--" + key} aria-hidden="true" />
                <span>{label}</span>
                <span className="legend__count">{n}</span>
              </li>
            ))
          : null}
      </ul>

      <p className="sample-note" id="sample-note" hidden={!detail?.facility.sampleTraffic}>
        Availability at this facility includes sample traffic for demonstration.
      </p>
    </section>
  );
}

function Cell({ s, selected, onPick }) {
  const nofit = s.status === "Available" && !s.fits;
  const usable = s.status === "Available" && s.fits;
  const what = nofit
    ? s.vehicleType.toLowerCase() + " bay, too small for your vehicle"
    : s.status === "Inactive"
      ? "out of service"
      : s.status.toLowerCase();

  return (
    <button
      type="button"
      className={"cell cell--" + (nofit ? "nofit" : s.status.toLowerCase()) + (selected ? " cell--selected" : "")}
      data-slot={s.id}
      aria-pressed={usable ? String(selected) : undefined}
      aria-label={s.id + ", " + (selected ? "selected" : what) + (usable ? ", " + s.vehicleType.toLowerCase() + " bay" : "")}
      title={s.vehicleType + " bay" + (usable ? "" : " · " + what)}
      disabled={!usable}
      // place by slot number so gaps in a row stay visible
      style={s.col ? { gridColumn: String(s.col + 1) } : undefined}
      onClick={() => onPick(s.id)}
    >
      {s.id}
    </button>
  );
}

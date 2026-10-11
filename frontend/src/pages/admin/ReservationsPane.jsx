import { useCallback, useEffect, useState } from "react";
import StatusPill from "../../components/StatusPill.jsx";
import { api } from "../../lib/api.js";
import { num, rwf } from "../../lib/format.js";
import { Actions, ConfirmActions, LinkButton, Select } from "./bits.jsx";

const STATUSES = [
  ["", "All"],
  ["Upcoming", "Upcoming"],
  ["Confirmed", "Confirmed (unpaid)"],
  ["Paid", "Paid"],
  ["Cancelled", "Cancelled"],
  ["No-show", "No-show"],
];

export default function ReservationsPane({ facilities, params, setHash }) {
  const [filters, setFilters] = useState(() => ({
    facility: params.get("facility") || "",
    status: params.get("status") || "",
    date: params.get("date") || "",
  }));
  const [list, setList] = useState([]);
  const [matching, setMatching] = useState(0);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setError("");
    const q = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    setHash("reservations", q);
    try {
      const res = await api("/api/admin/reservations?" + new URLSearchParams(q));
      setList(res.reservations);
      setMatching(res.total == null ? res.reservations.length : res.total);
    } catch (err) {
      setError(err.message);
    }
    setLoaded(true);
  }, [filters, setHash]);

  useEffect(() => {
    load();
  }, [load]);

  const paidTotal = list.reduce((n, r) => n + (r.payment.status === "Paid" ? r.amount : 0), 0);
  const set = (name) => (e) => setFilters((f) => ({ ...f, [name]: e.target.value }));

  return (
    <section className="pane" id="reservations" aria-labelledby="reservations-label">
      <h2 className="section-label" id="reservations-label">
        <span>All reservations</span>
        <span className="section-label__count" id="reservations-count">
          {String(matching).padStart(2, "0")}
        </span>
      </h2>

      <div className="toolbar">
        <div className="filters">
          <label className="filter">
            <span className="filter__label">Facility</span>
            <Select id="res-facility" value={filters.facility} onChange={set("facility")}>
              <option value="">All facilities</option>
              {facilities.map((f) => (
                <option value={f.id} key={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="filter">
            <span className="filter__label">Status</span>
            <Select id="res-status" value={filters.status} onChange={set("status")}>
              {STATUSES.map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <label className="filter">
            <span className="filter__label">Date</span>
            <input className="input mono" type="date" id="res-date" value={filters.date} onChange={set("date")} />
          </label>
          <button
            className="linkbtn filters__clear"
            type="button"
            id="res-clear"
            onClick={() => setFilters({ facility: "", status: "", date: "" })}
          >
            Clear
          </button>
        </div>
      </div>

      <p className="toolbar__summary" id="reservations-summary" aria-live="polite">
        {matching > list.length
          ? `Showing the latest ${num(list.length)} of ${num(matching)} reservations · filter by facility or date to narrow`
          : `${list.length}${list.length === 1 ? " reservation" : " reservations"} · ${rwf(paidTotal)} paid`}
      </p>
      <p className="pane__error" id="reservations-error" role="alert">
        {error}
      </p>

      <div className="table-wrap">
        <table className="table table--admin" id="reservations-table" hidden={!list.length}>
          <thead>
            <tr>
              <th scope="col">№</th>
              <th scope="col">Date</th>
              <th scope="col">Window</th>
              <th scope="col">Facility · slot</th>
              <th scope="col">Driver</th>
              <th scope="col">Plate</th>
              <th scope="col" className="num">
                Amount
              </th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody id="reservations-body">
            {list.map((r) => (
              <Row key={r.serial} r={r} load={load} setError={setError} />
            ))}
          </tbody>
        </table>
      </div>

      <p className="empty" id="reservations-empty" hidden={!loaded || !!list.length}>
        No reservations match these filters.
      </p>
    </section>
  );
}

function Row({ r, load, setError }) {
  const [confirming, setConfirming] = useState(false);
  const s = r.start.split("T");
  const e = r.end.split("T");
  const cancellable = r.status === "Confirmed" && !["Ended", "Left", "Parked"].includes(r.state);

  async function cancel() {
    setError("");
    try {
      await api(`/api/admin/reservations/${r.serial}/cancel`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err.message);
      setConfirming(false);
    }
  }

  return (
    <tr>
      <td className="mono table__muted">{r.serial}</td>
      <td className="mono">{r.date}</td>
      <td className="mono">{s[1] + "→" + e[1]}</td>
      <td className="wrap">
        {r.facility} <span className="stub__level">{`· ${r.level} ${r.slot}`}</span>
      </td>
      <td className="table__muted wrap">{r.user}</td>
      <td className="mono">{r.plate}</td>
      <td className="num">{rwf(r.amount)}</td>
      <td>
        <StatusPill status={r.display} />
      </td>
      {confirming ? (
        <ConfirmActions
          question={`Cancel № ${r.serial}?`}
          yesLabel="Yes, cancel"
          onYes={cancel}
          onKeep={() => setConfirming(false)}
        />
      ) : (
        <Actions>{cancellable ? <LinkButton label="Cancel" onClick={() => setConfirming(true)} /> : null}</Actions>
      )}
    </tr>
  );
}

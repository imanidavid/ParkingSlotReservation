import { useCallback, useEffect, useRef, useState } from "react";
import AppBar from "../components/AppBar.jsx";
import OfflineBanner from "../components/OfflineBanner.jsx";
import { api } from "../lib/api.js";
import { num } from "../lib/format.js";

const TYPES = ["Campus", "Office", "Mall", "Public"];
const VEHICLES = ["Car", "Motorcycle", "SUV", "Truck"];
const DURATIONS = [
  ["1h", "1h"],
  ["2h", "2h"],
  ["4h", "4h"],
  ["8h", "8h"],
  ["day", "Full day"],
];

const SORTS = {
  availability: (a, b) => b.available - a.available || a.name.localeCompare(b.name),
  rate: (a, b) => a.rateFrom - b.rateFrom || b.available - a.available,
  name: (a, b) => a.name.localeCompare(b.name),
};

function fromUrl() {
  const q = new URLSearchParams(window.location.search);
  const list = (key) => (q.get(key) || "").split(",").filter(Boolean);
  return {
    type: list("type"),
    vehicle: list("vehicle"),
    duration: q.get("duration") || "1h",
    date: q.get("date") || "",
    sort: SORTS[q.get("sort")] ? q.get("sort") : "availability",
  };
}

export default function Browse() {
  const [filters, setFilters] = useState(fromUrl);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  // Only the duration and the date change what the server has to compute; the
  // rest is filtering and sorting over the rows already in hand.
  useEffect(() => {
    const id = ++requestId.current;
    const q = new URLSearchParams({ duration: filters.duration });
    if (filters.date) q.set("date", filters.date);

    api("/api/facilities?" + q)
      .then((res) => {
        if (id !== requestId.current) return;
        setError("");
        setData(res);
        // The server decides the real date (it rolls past closing time).
        setFilters((f) => (f.date === res.date ? f : { ...f, date: res.date }));
      })
      .catch((err) => id === requestId.current && setError(err.message));
  }, [filters.duration, filters.date]);

  // Filters live in the URL so a filtered view can be shared or reloaded.
  useEffect(() => {
    if (!data) return;
    const q = new URLSearchParams();
    if (filters.type.length) q.set("type", filters.type.join(","));
    if (filters.vehicle.length) q.set("vehicle", filters.vehicle.join(","));
    if (filters.duration !== "1h") q.set("duration", filters.duration);
    if (filters.date && filters.date !== data.today) q.set("date", filters.date);
    if (filters.sort !== "availability") q.set("sort", filters.sort);
    const qs = q.toString();
    history.replaceState(null, "", "browse.html" + (qs ? "?" + qs : ""));
  }, [filters, data]);

  const toggle = useCallback((key, value) => {
    setFilters((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));
  }, []);

  const rows = (data?.facilities || [])
    .filter((f) => {
      if (filters.type.length && !filters.type.includes(f.type)) return false;
      if (filters.vehicle.length && !filters.vehicle.every((v) => f.vehicles.includes(v))) return false;
      return true;
    })
    .sort(SORTS[filters.sort]);

  const isToday = data ? data.date === data.today : true;
  let summary = "Loading…";
  if (error) summary = error;
  else if (data) {
    const free = rows.reduce((n, f) => n + f.available, 0);
    summary = [
      rows.length + (rows.length === 1 ? " facility" : " facilities"),
      num(free) + (free === 1 ? " slot" : " slots") + " available",
      data.window
        ? (isToday ? "" : data.date + " ") + data.window.start + " → " + data.window.end
        : "closed for the rest of today",
    ].join(" · ");
  }

  return (
    <>
      <AppBar active="browse" />
      <OfflineBanner />

      <main className="browse">
        <h1 className="sr-only">Browse facilities</h1>

        <form className="rail" id="filters" aria-label="Filters" onSubmit={(e) => e.preventDefault()}>
          <fieldset className="rail__group">
            <legend className="rail__label">Facility type</legend>
            {TYPES.map((t) => (
              <label className="check" key={t}>
                <input type="checkbox" name="type" value={t} checked={filters.type.includes(t)} onChange={() => toggle("type", t)} />{" "}
                {t}
              </label>
            ))}
          </fieldset>

          <fieldset className="rail__group">
            <legend className="rail__label">Vehicle type</legend>
            {VEHICLES.map((v) => (
              <label className="check" key={v}>
                <input
                  type="checkbox"
                  name="vehicle"
                  value={v}
                  checked={filters.vehicle.includes(v)}
                  onChange={() => toggle("vehicle", v)}
                />{" "}
                {v}
              </label>
            ))}
          </fieldset>

          <fieldset className="rail__group">
            <legend className="rail__label">Duration</legend>
            {DURATIONS.map(([value, label]) => (
              <label className="check" key={value}>
                <input
                  type="radio"
                  name="duration"
                  value={value}
                  checked={filters.duration === value}
                  onChange={() => setFilters((f) => ({ ...f, duration: value }))}
                />{" "}
                {label}
              </label>
            ))}
          </fieldset>

          <div className="rail__group">
            <label className="rail__label" htmlFor="filter-date">
              Date
            </label>
            <input
              className="input mono"
              type="date"
              id="filter-date"
              name="date"
              min={data?.today}
              value={filters.date}
              onChange={(e) => e.target.value && setFilters((f) => ({ ...f, date: e.target.value }))}
            />
          </div>

          <div className="rail__group rail__group--reset">
            <a className="link" href="browse.html" id="filters-reset">
              Reset
            </a>
          </div>
        </form>

        <section className="results" aria-labelledby="results-summary">
          <div className="results__bar">
            <p className={"results__summary" + (error ? " error-text" : "")} id="results-summary" aria-live="polite">
              {summary}
            </p>
            <label className="sort">
              <span>Sort:</span>
              <span className="sort__control">
                <select id="sort" name="sort" value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}>
                  <option value="availability">Availability</option>
                  <option value="rate">Rate</option>
                  <option value="name">Name</option>
                </select>
                <span aria-hidden="true">▾</span>
              </span>
            </label>
          </div>

          <div className="table-wrap">
            <table className="table table--browse" hidden={!!data && rows.length === 0}>
              <thead>
                <tr>
                  <th scope="col">Facility</th>
                  <th scope="col" className="col-location">
                    Address
                  </th>
                  <th scope="col" className="num col-total">
                    Total slots
                  </th>
                  <th scope="col" className="num" id="available-heading">
                    {isToday ? "Available now" : "Available"}
                  </th>
                  <th scope="col" className="num">
                    Rates from
                  </th>
                  <th scope="col">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody id="results-body">
                {data
                  ? rows.map((f) => <Row key={f.id} f={f} data={data} isToday={isToday} />)
                  : null}
              </tbody>
            </table>
          </div>

          <p className="empty" id="results-empty" hidden={!data || rows.length !== 0}>
            No facilities match these filters.{" "}
            <a className="link" href="browse.html">
              Reset
            </a>
          </p>
        </section>
      </main>
    </>
  );
}

function Row({ f, data, isToday }) {
  const q = new URLSearchParams({ id: f.id, duration: data.duration });
  if (!isToday) q.set("date", data.date);
  const href = "facility.html?" + q;

  return (
    <tr onClick={(e) => !e.target.closest("a") && window.location.assign(href)}>
      <td>
        <a className="table__name" href={href}>
          {f.name}
        </a>
        <span className="table__type">{f.type}</span>
      </td>
      <td className="table__muted col-location">{f.address + ", " + f.city}</td>
      <td className="num table__muted col-total">{num(f.totalSlots)}</td>
      <td className={"num" + (f.available === 0 ? " avail--none" : "")}>{num(f.available)}</td>
      <td className="num">{num(f.rateFrom) + " RWF/H"}</td>
      <td className="table__action">
        <a className="link" href={href} tabIndex={-1} aria-hidden="true">
          View slots →
        </a>
      </td>
    </tr>
  );
}

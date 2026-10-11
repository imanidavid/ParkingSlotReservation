import { useEffect, useState } from "react";
import AppBar from "../components/AppBar.jsx";
import OfflineBanner from "../components/OfflineBanner.jsx";
import StatusPill from "../components/StatusPill.jsx";
import Ticket from "../components/Ticket.jsx";
import { api } from "../lib/api.js";
import { count2, num, rwf } from "../lib/format.js";

export default function Home() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    api("/api/home")
      .then((d) => live && setData(d))
      .catch((err) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, []);

  return (
    <>
      <AppBar active="home" />
      <OfflineBanner />

      <main className="page">
        <section className="print-target" aria-labelledby="upcoming-label">
          <h2 className="section-label" id="upcoming-label">
            Upcoming
          </h2>
          <div id="upcoming-ticket">
            {error ? <p className="empty error-text">{error}</p> : null}
            {data && !data.upcoming ? (
              <p className="empty">
                No upcoming reservation.{" "}
                <a className="link" href="browse.html">
                  Browse facilities
                </a>
              </p>
            ) : null}
            {data?.upcoming ? <Ticket r={data.upcoming} /> : null}
          </div>
          <p className="ticket-actions" id="upcoming-actions" hidden={!data?.upcoming}>
            <a className="link" href={"ticket.html?serial=" + encodeURIComponent(data?.upcoming?.serial || "")} id="show-at-entry">
              Show at entry
            </a>
            <span className="appbar__dot" aria-hidden="true">
              ·
            </span>
            <a className="link" href="reservations.html">
              View all reservations
            </a>
          </p>
        </section>

        <section id="browse" aria-labelledby="browse-label">
          <h2 className="section-label" id="browse-label">
            <span>Browse facilities</span>
            <span className="section-label__count" id="facilities-count">
              {data ? String(data.facilityCount).padStart(2, "0") : ""}
            </span>
          </h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Facility</th>
                  <th scope="col" className="col-location">
                    Address
                  </th>
                  <th scope="col" className="num">
                    Available
                  </th>
                  <th scope="col" className="num">
                    Rates from
                  </th>
                </tr>
              </thead>
              <tbody id="facilities-body">
                {(data?.facilities || []).map((f) => (
                  <FacilityRow key={f.id} f={f} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="section-more">
            <a className="link" href="browse.html">
              All facilities →
            </a>
          </p>
        </section>

        <section id="past" aria-labelledby="past-label">
          <h2 className="section-label" id="past-label">
            <span>Past reservations</span>
            <span className="section-label__count">Last 5</span>
          </h2>
          <ol className="stubs" id="past-list">
            {data && !data.past.length ? <li className="empty stubs__empty">No past reservations yet.</li> : null}
            {(data?.past || []).map((r) => (
              <li className="stub" key={r.serial}>
                <time className="stub__date" dateTime={r.date}>
                  {r.date}
                </time>
                <span className="stub__slot">{r.slot}</span>
                <span className="stub__facility">
                  {r.facility} <span className="stub__level">{"· " + r.level}</span>
                </span>
                <span className="stub__amount">{rwf(r.amount)}</span>
                <span className="stub__status">
                  <StatusPill status={r.display} />
                </span>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}

// The whole row is clickable, but the name stays a real link so the keyboard
// and "open in new tab" both still work.
function FacilityRow({ f }) {
  const href = "facility.html?id=" + encodeURIComponent(f.id);
  return (
    <tr onClick={(e) => !e.target.closest("a") && window.location.assign(href)}>
      <td>
        <a className="table__name" href={href}>
          {f.name}
        </a>
      </td>
      <td className="table__muted col-location">{f.address + ", " + f.city}</td>
      <td className="num">
        <span className={"avail" + (f.available === 0 ? " avail--none" : "")}>{f.available}</span>
        <span className="avail__total">{" / " + f.totalSlots}</span>
      </td>
      <td className="num">{num(f.rateFrom) + " RWF/H"}</td>
    </tr>
  );
}

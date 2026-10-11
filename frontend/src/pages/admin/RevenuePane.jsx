import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { num, rwf } from "../../lib/format.js";

export default function RevenuePane() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    api("/api/admin/revenue")
      .then((rep) => live && setReport(rep))
      .catch((err) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, []);

  const rows = report ? [...report.rows].sort((a, b) => b.revenue - a.revenue || b.occupancy - a.occupancy) : [];
  const sample = rows.some((r) => r.sampleTraffic);
  const t = report?.total;

  return (
    <section className="pane" id="revenue" aria-labelledby="revenue-label">
      <h2 className="section-label" id="revenue-label">
        <span>Occupancy &amp; revenue by facility</span>
        <span className="section-label__count" id="revenue-asof">
          {report ? "As of " + report.asOf : ""}
        </span>
      </h2>
      <p className="toolbar__summary" id="revenue-summary">
        {report ? `Occupancy now · bookings and revenue ${report.since} → ${report.until}` : ""}
      </p>
      <p className="pane__error" id="revenue-error" role="alert">
        {error}
      </p>

      <div className="table-wrap">
        <table className="table table--admin table--revenue">
          <thead>
            <tr>
              <th scope="col">Facility</th>
              <th scope="col" className="num">
                In service
              </th>
              <th scope="col" className="num">
                Occupied
              </th>
              <th scope="col" className="num">
                Reserved
              </th>
              <th scope="col" className="num">
                Occupancy
              </th>
              <th scope="col" className="num">
                Bookings 30d
              </th>
              <th scope="col" className="num">
                Revenue 30d
              </th>
              <th scope="col" className="num">
                Pending
              </th>
            </tr>
          </thead>
          <tbody id="revenue-body">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="wrap">
                  <span className="table__name">{r.name + (r.sampleTraffic ? " *" : "")}</span>
                  {r.active ? null : <span className="table__type">inactive</span>}
                </td>
                <td className="num">{num(r.slots)}</td>
                <td className="num">{num(r.occupied)}</td>
                <td className="num">{num(r.reserved)}</td>
                <td className="num">
                  <span className="meter" aria-hidden="true">
                    <span className="meter__fill" style={{ width: r.occupancy + "%" }} />
                  </span>
                  <span>{r.occupancy + "%"}</span>
                </td>
                <td className="num">{num(r.reservations)}</td>
                <td className="num table__strong">{rwf(r.revenue)}</td>
                <td className="num table__muted">{rwf(r.pending)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot id="revenue-foot">
            {t ? (
              <tr>
                <th scope="row">All facilities</th>
                <td className="num">{num(t.slots)}</td>
                <td className="num">{num(t.occupied)}</td>
                <td className="num">{num(t.reserved)}</td>
                <td className="num">{t.occupancy + "%"}</td>
                <td className="num">{num(t.reservations)}</td>
                <td className="num">{rwf(t.revenue)}</td>
                <td className="num">{rwf(t.pending)}</td>
              </tr>
            ) : null}
          </tfoot>
        </table>
      </div>

      <p className="sample-note" id="revenue-note">
        {(sample ? "* Occupancy includes sample traffic for demonstration. " : "") +
          "Revenue counts recorded payments only."}
      </p>
    </section>
  );
}

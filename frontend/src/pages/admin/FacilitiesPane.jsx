import { useState } from "react";
import StatusPill from "../../components/StatusPill.jsx";
import { api } from "../../lib/api.js";
import { num } from "../../lib/format.js";
import AdminForm from "./AdminForm.jsx";
import { Actions, ConfirmActions, LinkButton } from "./bits.jsx";

export const facilityDefs = (types) => [
  { name: "name", label: "Name", wide: true },
  { name: "address", label: "Address", wide: true },
  { name: "city", label: "City" },
  { name: "type", label: "Type", type: "select", options: types.map((t) => ({ value: t, label: t })) },
  { name: "rate", label: "Rate (RWF/hour)", type: "number", mono: true },
  { name: "levels", label: "Levels", mono: true, placeholder: "B1, B2", hint: "Comma-separated, e.g. G, P1" },
];

/** Client-side checks mirror the server's; the server still validates. */
export function checkFacility(v) {
  const e = {};
  if (v.name.length < 2) e.name = "2–80 characters.";
  if (v.address.length < 2) e.address = "2–120 characters.";
  if (v.city.length < 2) e.city = "2–60 characters.";
  const rate = Number(v.rate);
  if (!Number.isInteger(rate) || rate < 100 || rate > 20000) e.rate = "Whole RWF between 100 and 20,000.";
  const levels = v.levels.toUpperCase().split(/[\s,]+/).filter(Boolean);
  if (!levels.length || levels.some((l) => !/^[A-Z0-9]{1,3}$/.test(l))) e.levels = "e.g. B1, B2";
  return e;
}

export default function FacilitiesPane({ facilities, meta, reload, error, setError }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);

  const active = facilities.filter((f) => f.active).length;
  const slotsTotal = facilities.reduce((n, f) => n + f.activeSlots, 0);

  return (
    <section className="pane" id="facilities" aria-labelledby="facilities-label">
      <h2 className="section-label" id="facilities-label">
        <span>Facilities</span>
        <span className="section-label__count" id="facilities-count">
          {String(facilities.length).padStart(2, "0")}
        </span>
      </h2>

      <div className="toolbar">
        <p className="toolbar__summary" id="facilities-summary" aria-live="polite">
          {`${facilities.length} facilities · ${active} active · ${num(slotsTotal)} slots in service`}
        </p>
        <button className="btn btn--secondary btn--small" type="button" id="facility-new" onClick={() => setCreating(true)}>
          New facility
        </button>
      </div>

      <div id="facility-create">
        {creating ? (
          <AdminForm
            prefix="nf"
            title="New facility"
            defs={facilityDefs(meta.facilityTypes)}
            initial={{ city: "Kigali", rate: 300, levels: "G" }}
            submitLabel="Create facility"
            validate={checkFacility}
            onSubmit={async (vals) => {
              const res = await api("/api/admin/facilities", { method: "POST", body: vals });
              setCreating(false);
              window.location.hash = "#slots?facility=" + encodeURIComponent(res.facility.id);
            }}
            onCancel={() => setCreating(false)}
          />
        ) : null}
      </div>

      <p className="pane__error" id="facilities-error" role="alert">
        {error}
      </p>

      <div className="table-wrap">
        <table className="table table--admin" id="facilities-table">
          <thead>
            <tr>
              <th scope="col">Facility</th>
              <th scope="col">Address</th>
              <th scope="col">Levels</th>
              <th scope="col" className="num">
                Slots
              </th>
              <th scope="col" className="num">
                Rate
              </th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody id="facilities-body">
            {facilities.map((f) => (
              <Row
                key={f.id}
                f={f}
                meta={meta}
                reload={reload}
                setError={setError}
                editing={editing === f.id}
                onEdit={() => setEditing(f.id)}
                onDoneEditing={() => setEditing(null)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({ f, meta, reload, setError, editing, onEdit, onDoneEditing }) {
  const [confirming, setConfirming] = useState(false);

  async function patch(changes) {
    setError("");
    try {
      await api(`/api/admin/facilities/${encodeURIComponent(f.id)}`, { method: "PATCH", body: changes });
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove() {
    setError("");
    try {
      await api(`/api/admin/facilities/${encodeURIComponent(f.id)}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      setError(err.message);
      setConfirming(false);
    }
  }

  return (
    <>
      <tr data-id={f.id}>
        <td>
          <span className="table__name">{f.name}</span>
          <span className="table__type">{f.type + (f.sampleTraffic ? " · sample traffic" : "")}</span>
        </td>
        <td className="table__muted wrap">{f.address + ", " + f.city}</td>
        <td className="mono">{f.levels.join(", ")}</td>
        <td className="num">
          <span>{num(f.activeSlots)}</span>
          {f.activeSlots !== f.totalSlots ? <span className="avail__total">{" / " + num(f.totalSlots)}</span> : null}
        </td>
        <td className="num">{num(f.rate)}</td>
        <td>
          <StatusPill status={f.active ? "Active" : "Inactive"} />
        </td>
        {confirming ? (
          <ConfirmActions
            question={`Delete ${f.name}?`}
            yesLabel="Yes, delete"
            onYes={remove}
            onKeep={() => setConfirming(false)}
          />
        ) : (
          <Actions>
            <LinkButton label="Edit" onClick={onEdit} />
            <a className="link" href={"#slots?facility=" + encodeURIComponent(f.id)}>
              Slots
            </a>
            <LinkButton label={f.active ? "Deactivate" : "Activate"} onClick={() => patch({ active: !f.active })} />
            <LinkButton label="Delete" onClick={() => setConfirming(true)} />
          </Actions>
        )}
      </tr>

      {editing ? (
        <tr className="row-editor">
          <td colSpan="7">
            <AdminForm
              prefix="ef"
              title={"Edit " + f.name}
              defs={facilityDefs(meta.facilityTypes)}
              initial={{ ...f, levels: f.levels.join(", ") }}
              submitLabel="Save changes"
              validate={checkFacility}
              onSubmit={async (vals) => {
                await api(`/api/admin/facilities/${encodeURIComponent(f.id)}`, { method: "PATCH", body: vals });
                onDoneEditing();
                await reload();
              }}
              onCancel={onDoneEditing}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

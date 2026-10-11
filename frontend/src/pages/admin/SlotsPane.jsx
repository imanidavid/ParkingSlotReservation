import { useCallback, useEffect, useRef, useState } from "react";
import StatusPill from "../../components/StatusPill.jsx";
import { api } from "../../lib/api.js";
import AdminForm from "./AdminForm.jsx";
import { Actions, ConfirmActions, LinkButton, Select } from "./bits.jsx";

const slotDefs = (facility, vehicleTypes) => [
  { name: "level", label: "Level", type: "select", options: facility.levels.map((l) => ({ value: l, label: l })) },
  { name: "slotNumber", label: "Slot number", mono: true, placeholder: "A13", hint: "Row letter(s) + number" },
  { name: "vehicleType", label: "Vehicle type", type: "select", options: vehicleTypes.map((v) => ({ value: v, label: v })) },
];

function checkSlot(v) {
  const e = {};
  if (!/^[A-Z]{1,2}\d{1,3}$/.test(v.slotNumber.toUpperCase().replace(/\s+/g, ""))) e.slotNumber = "e.g. A13";
  return e;
}

export default function SlotsPane({ facilities, meta, reloadFacilities, params, setHash }) {
  const wanted = params.get("facility");
  const known = facilities.find((f) => f.id === wanted);
  const refreshed = useRef(false);
  const [level, setLevel] = useState(() => params.get("level") || "");

  // Asked for a facility this pane has never heard of — it was just created,
  // or the link is old. Refresh the list once before falling back to the
  // first facility, so a brand-new facility opens on its own slots.
  useEffect(() => {
    if (wanted && !known && !refreshed.current) {
      refreshed.current = true;
      reloadFacilities();
    }
  }, [wanted, known, reloadFacilities]);

  const facility = known || (wanted && !refreshed.current ? null : facilities[0]);
  const [slots, setSlots] = useState([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!facility) return;
    setError("");
    const q = new URLSearchParams({ facility: facility.id });
    if (level) q.set("level", level);
    try {
      const res = await api("/api/admin/slots?" + q);
      setSlots(res.slots);
    } catch (err) {
      setError(err.message);
    }
    setLoaded(true);
  }, [facility, level]);

  // The hash carries the facility and level so a view can be linked to.
  useEffect(() => {
    if (!facility) return;
    setHash("slots", { facility: facility.id, ...(level ? { level } : {}) });
    load();
  }, [facility, level, load, setHash]);

  if (!facility) return <section className="pane" id="slots" aria-labelledby="slots-label" />;

  const inService = slots.filter((s) => s.active).length;
  const out = slots.length - inService;

  function pickFacility(id) {
    setCreating(false);
    setLevel("");
    // A hash change is the route; the pane re-derives its facility from it.
    window.location.hash = "#slots?facility=" + encodeURIComponent(id);
  }

  return (
    <section className="pane" id="slots" aria-labelledby="slots-label">
      <h2 className="section-label" id="slots-label">
        <span>Parking slots</span>
        <span className="section-label__count" id="slots-count">
          {String(slots.length).padStart(2, "0")}
        </span>
      </h2>

      <div className="toolbar">
        <div className="filters">
          <label className="filter">
            <span className="filter__label">Facility</span>
            <Select id="slots-facility" value={facility.id} onChange={(e) => pickFacility(e.target.value)}>
              {facilities.map((f) => (
                <option value={f.id} key={f.id}>
                  {f.name + (f.active ? "" : " (inactive)")}
                </option>
              ))}
            </Select>
          </label>
          <label className="filter">
            <span className="filter__label">Level</span>
            <Select id="slots-level" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">All levels</option>
              {facility.levels.map((l) => (
                <option value={l} key={l}>
                  {l}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <button className="btn btn--secondary btn--small" type="button" id="slot-new" onClick={() => setCreating(true)}>
          New slot
        </button>
      </div>

      <div id="slot-create">
        {creating ? (
          <AdminForm
            prefix="ns"
            title={"New slot at " + facility.name}
            defs={slotDefs(facility, meta.vehicleTypes)}
            initial={{ level: level || facility.levels[0], vehicleType: "Car" }}
            submitLabel="Create slot"
            validate={checkSlot}
            onSubmit={async (vals) => {
              await api("/api/admin/slots", { method: "POST", body: { ...vals, facilityId: facility.id } });
              await Promise.all([load(), reloadFacilities()]);
              // keep the form open for adding the next slot
              return { clear: "slotNumber" };
            }}
            onCancel={() => setCreating(false)}
          />
        ) : null}
      </div>

      <p className="toolbar__summary" id="slots-summary" aria-live="polite">
        {`${slots.length}${slots.length === 1 ? " slot" : " slots"} · ${inService} in service` +
          (out ? ` · ${out} out of service` : "")}
      </p>
      <p className="pane__error" id="slots-error" role="alert">
        {error}
      </p>

      <div className="table-wrap">
        <table className="table table--admin" id="slots-table" hidden={!slots.length}>
          <thead>
            <tr>
              <th scope="col">Level</th>
              <th scope="col">Slot</th>
              <th scope="col">Vehicle type</th>
              <th scope="col">Service</th>
              <th scope="col">Now</th>
              <th scope="col" className="num">
                Upcoming
              </th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody id="slots-body">
            {slots.map((s) => (
              <Row
                key={s.slotId}
                s={s}
                facility={facility}
                meta={meta}
                load={load}
                setError={setError}
                editing={editing === s.slotId}
                onEdit={() => setEditing(s.slotId)}
                onDoneEditing={() => setEditing(null)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="empty" id="slots-empty" hidden={!loaded || !!slots.length}>
        No slots on this level yet. Use “New slot” to add one.
      </p>
    </section>
  );
}

function Row({ s, facility, meta, load, setError, editing, onEdit, onDoneEditing }) {
  const [confirming, setConfirming] = useState(false);

  async function patch(changes) {
    setError("");
    try {
      await api(`/api/admin/slots/${s.slotId}`, { method: "PATCH", body: changes });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove() {
    setError("");
    try {
      await api(`/api/admin/slots/${s.slotId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message);
      setConfirming(false);
    }
  }

  return (
    <>
      <tr data-slot={s.slotId}>
        <td className="mono">{s.level}</td>
        <td className="mono table__strong">{s.slotNumber}</td>
        <td>{s.vehicleType}</td>
        <td>
          <StatusPill status={s.active ? "Active" : "Inactive"} />
        </td>
        <td>{s.active ? <StatusPill status={s.status} /> : <span className="table__muted">—</span>}</td>
        <td className="num">{s.upcoming}</td>
        {confirming ? (
          <ConfirmActions
            question={`Delete ${s.level} ${s.slotNumber}?`}
            yesLabel="Yes, delete"
            onYes={remove}
            onKeep={() => setConfirming(false)}
          />
        ) : (
          <Actions>
            <LinkButton label="Edit" onClick={onEdit} />
            <LinkButton label={s.active ? "Deactivate" : "Activate"} onClick={() => patch({ active: !s.active })} />
            <LinkButton label="Delete" onClick={() => setConfirming(true)} />
          </Actions>
        )}
      </tr>

      {editing ? (
        <tr className="row-editor">
          <td colSpan="7">
            <AdminForm
              prefix="es"
              title={`Edit ${s.level} ${s.slotNumber}`}
              defs={slotDefs(facility, meta.vehicleTypes)}
              initial={s}
              submitLabel="Save changes"
              validate={checkSlot}
              onSubmit={async (vals) => {
                await api(`/api/admin/slots/${s.slotId}`, { method: "PATCH", body: vals });
                onDoneEditing();
                await load();
              }}
              onCancel={onDoneEditing}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

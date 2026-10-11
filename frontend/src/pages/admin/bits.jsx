import { Children, Fragment, useState } from "react";

export function Sep() {
  return (
    <span className="rstub__dot" aria-hidden="true">
      ·
    </span>
  );
}

/** The actions column: whatever is passed, separated by dots, nulls dropped. */
export function Actions({ children }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <td className="admin__actions">
      {items.map((node, i) => (
        <Fragment key={i}>
          {i ? <Sep /> : null}
          {node}
        </Fragment>
      ))}
    </td>
  );
}

export function LinkButton({ label, onClick, danger, disabled }) {
  return (
    <button type="button" className={"linkbtn" + (danger ? " linkbtn--danger" : "")} disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
}

/**
 * Destructive actions confirm in place — "Delete X? Yes, delete · Keep" — rather
 * than in a dialog, so the row you are about to remove stays in front of you.
 */
export function ConfirmActions({ question, yesLabel, onYes, onKeep }) {
  const [busy, setBusy] = useState(false);
  return (
    <td className="admin__actions">
      <span className="rstub__ask">{question + " "}</span>
      <button
        type="button"
        className="linkbtn linkbtn--danger"
        disabled={busy}
        autoFocus
        onClick={() => {
          setBusy(true);
          Promise.resolve(onYes()).catch(() => setBusy(false));
        }}
      >
        {busy ? yesLabel + "…" : yesLabel}
      </button>
      <Sep />
      <LinkButton label="Keep" onClick={onKeep} />
    </td>
  );
}

export function Select({ id, value, onChange, children, label }) {
  return (
    <span className="select">
      <select className="input mono" id={id} aria-label={label} value={value} onChange={onChange}>
        {children}
      </select>
      <span className="select__caret" aria-hidden="true">
        ▾
      </span>
    </span>
  );
}

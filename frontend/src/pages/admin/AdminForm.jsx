import { useEffect, useRef, useState } from "react";

/**
 * The inline create/edit form both CRUD panes use, built from field
 * definitions so a new field is one entry rather than a block of markup.
 *
 * defs: [{ name, label, type: "text"|"number"|"select", options, mono, hint,
 *          placeholder, wide }]
 * validate(values) -> { field: message } — mirrors the server, which checks again.
 * onSubmit(values) -> may throw an api error; return { clear: "name" } to keep
 *   the form open for the next entry instead of letting the parent close it.
 */
export default function AdminForm({ prefix, title, defs, initial, submitLabel, validate, onSubmit, onCancel }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      defs.map((d) => [d.name, initial[d.name] != null ? String(initial[d.name]) : d.type === "select" ? d.options[0].value : ""]),
    ),
  );
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const firstField = useRef(null);

  useEffect(() => {
    firstField.current?.focus();
  }, []);

  function focusFirst(found) {
    const name = defs.map((d) => d.name).find((n) => found[n]);
    if (name) document.getElementById(`${prefix}-${name}`)?.focus();
  }

  async function submit(event) {
    event.preventDefault();
    setFormError("");

    const trimmed = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()]));
    const found = validate ? validate(trimmed) : {};
    if (Object.keys(found).length) {
      setErrors(found);
      focusFirst(found);
      return;
    }
    setErrors({});

    setSaving(true);
    try {
      const result = await onSubmit(trimmed);
      if (result?.clear) {
        setValues((v) => ({ ...v, [result.clear]: "" }));
        document.getElementById(`${prefix}-${result.clear}`)?.focus();
        setSaving(false);
      }
      // otherwise the parent closes this form, so leave the button disabled
    } catch (err) {
      setSaving(false);
      const fields = err.data?.fields || {};
      const known = Object.fromEntries(Object.entries(fields).filter(([k]) => k in values));
      if (Object.keys(known).length) {
        setErrors(known);
        focusFirst(known);
      } else {
        setFormError(err.message);
      }
    }
  }

  const set = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: "" } : e));
  };

  return (
    <form
      className="aform"
      noValidate
      aria-label={title}
      onSubmit={submit}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <p className="aform__title">{title}</p>
      <div className="aform__grid">
        {defs.map((d, i) => {
          const id = `${prefix}-${d.name}`;
          const described = `${id}-error` + (d.hint ? ` ${id}-hint` : "");
          const common = {
            id,
            name: d.name,
            value: values[d.name],
            "aria-describedby": described,
            "aria-invalid": errors[d.name] ? "true" : undefined,
            onChange: (e) => set(d.name, e.target.value),
            ref: i === 0 ? firstField : undefined,
          };
          return (
            <div className={"aform__field" + (d.wide ? " aform__field--wide" : "")} key={d.name}>
              <label className="aform__label" htmlFor={id}>
                {d.label}
              </label>
              {d.type === "select" ? (
                <span className="select">
                  <select className="input mono" {...common}>
                    {d.options.map((o) => (
                      <option value={o.value} key={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <span className="select__caret" aria-hidden="true">
                    ▾
                  </span>
                </span>
              ) : (
                <input
                  className={"input" + (d.mono ? " mono" : "")}
                  type={d.type === "number" ? "number" : "text"}
                  inputMode={d.type === "number" ? "numeric" : undefined}
                  placeholder={d.placeholder}
                  autoComplete="off"
                  spellCheck="false"
                  {...common}
                />
              )}
              {d.hint ? (
                <span className="aform__hint" id={`${id}-hint`}>
                  {d.hint}
                </span>
              ) : null}
              <span className="field__error" id={`${id}-error`}>
                {errors[d.name] || ""}
              </span>
            </div>
          );
        })}
      </div>
      <p className="aform__error" role="alert">
        {formError}
      </p>
      <div className="aform__buttons">
        <button className="btn btn--primary" type="submit" disabled={saving}>
          {submitLabel}
        </button>
        <button className="btn btn--secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

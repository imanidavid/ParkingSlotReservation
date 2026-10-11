import { useState } from "react";

/** Password field with the Show/Hide action button the auth pages share. */
export default function PasswordInput({ id, value, onChange, autoComplete, maxLength, describedBy, invalid }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="field__control">
      <input
        className="input input--with-action"
        id={id}
        name={id}
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        maxLength={maxLength}
        aria-describedby={describedBy}
        aria-invalid={invalid ? "true" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      />
      <button
        className="input-action"
        id={`${id}-toggle`}
        type="button"
        aria-controls={id}
        aria-pressed={String(shown)}
        aria-label={shown ? "Hide password" : "Show password"}
        onClick={() => setShown((s) => !s)}
      >
        {shown ? "Hide" : "Show"}
      </button>
    </div>
  );
}

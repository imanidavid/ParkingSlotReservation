/** The mono message under an input. Its id is "<input id>-error" throughout. */
export default function FieldError({ for: name, error, role }) {
  return (
    <span className="field__error" id={`${name}-error`} role={role}>
      {error || ""}
    </span>
  );
}

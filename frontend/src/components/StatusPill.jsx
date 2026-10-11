export default function StatusPill({ status }) {
  return (
    <span className={"pill pill--" + status.toLowerCase().replace(/[^a-z]+/g, "-")}>
      {status.toUpperCase()}
    </span>
  );
}

// Formatting shared by every page. Pure functions, no DOM.

const numberFmt = new Intl.NumberFormat("en-US");

export function num(n) {
  return numberFmt.format(n);
}

export function rwf(amount) {
  return num(amount) + " RWF";
}

// "2026-09-24T08:00" -> { date: "2026-09-24", time: "08:00" }
export function splitStamp(value) {
  const [date, time] = value.split("T");
  return { date, time: time.slice(0, 5) };
}

export function windowLabel(start, end) {
  const s = splitStamp(start);
  const e = splitStamp(end);
  return `${s.date} ${s.time} → ${s.date === e.date ? e.time : e.date + " " + e.time}`;
}

// Plates: letters/digits/spaces, 4–12 chars, at least one digit (same rule as
// the server, which validates again regardless).
export function cleanPlate(value) {
  const p = String(value || "").toUpperCase().replace(/\s+/g, " ").trim();
  return /^[A-Z0-9 ]{4,12}$/.test(p) && /\d/.test(p) ? p : null;
}

export function param(name) {
  return new URLSearchParams(window.location.search).get(name) || "";
}

export function pad2(n) {
  return String(n).padStart(2, "0");
}

// "07" for a count of 7; empty for nothing, which is how the section headers
// hide their counter until there is something to count.
export function count2(n) {
  return n ? String(n).padStart(2, "0") : "";
}

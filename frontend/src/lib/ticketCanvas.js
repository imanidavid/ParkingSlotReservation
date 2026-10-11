// "Save ticket": redraw the stub on a canvas, always on light paper, so the
// saved PNG doesn't come out as a dark rectangle for anyone using dark mode.
// Imperative by nature — React draws the on-screen slip, this draws the file.

import { qrCells } from "../components/Qr.jsx";
import { rwf } from "./format.js";

const PAPER = { bg: "#F4F1EA", surface: "#FFFFFF", ink: "#1A1A1A", muted: "#6B6558", rule: "#D8D2C4", stamp: "#B22B1F" };
const DISPLAY = '"Fraunces", Georgia, serif';
const MONO = '"IBM Plex Mono", ui-monospace, monospace';

/** The ticket's contents, shared by the on-screen slip and the saved PNG. */
export function ticketFields(r) {
  const s = r.start.split("T");
  const e = r.end.split("T");
  const paid = r.payment.status === "Paid";
  return {
    serial: "№ " + r.serial,
    slot: r.slot,
    where: (r.facility + " · Level " + r.level).toUpperCase(),
    rows: [
      ["Date", s[0]],
      ["Window", s[1] + " → " + (s[0] === e[0] ? e[1] : e[0] + " " + e[1])],
      ["Duration", r.duration],
      ["Vehicle", (r.vehicle || "—").toUpperCase()],
      ["Plate", r.plate],
      ["Amount", rwf(r.amount)],
      ["Method", (r.payment.method || "—").toUpperCase()],
    ],
    stamp: r.status === "Cancelled" ? "Void" : paid ? "Paid" : "Confirmed",
    stampMuted: r.status === "Cancelled" || !paid,
  };
}

export function drawTicket(r) {
  const f = ticketFields(r);
  const W = 480;
  const padL = 28;
  const padR = 32;
  const rowH = 26;
  const topH = 46;
  const heroH = 168;
  const specH = 28 + f.rows.length * rowH;
  const bottomH = 116;
  const H = topH + heroH + specH + bottomH;
  const scale = 2;
  const margin = 24;

  const canvas = document.createElement("canvas");
  canvas.width = (W + margin * 2) * scale;
  canvas.height = (H + margin * 2) * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  // paper background around the stub
  ctx.fillStyle = PAPER.bg;
  ctx.fillRect(0, 0, W + margin * 2, H + margin * 2);
  ctx.translate(margin, margin);

  ctx.fillStyle = PAPER.surface;
  ctx.fillRect(0, 0, W, H);

  // grain
  for (let n = 0; n < 2600; n++) {
    ctx.fillStyle = "rgba(26,26,26," + (Math.random() * 0.05).toFixed(3) + ")";
    ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1);
  }

  const hline = (y) => {
    ctx.strokeStyle = PAPER.rule;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  };

  const text = (str, x, y, font, color, align, spacing) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    if ("letterSpacing" in ctx) ctx.letterSpacing = spacing || "0px";
    ctx.fillText(str, x, y);
  };

  // frame: top/bottom rules, perforated left, scalloped right
  hline(0);
  hline(H - 1);
  ctx.strokeStyle = PAPER.muted;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(0.5, 0);
  ctx.lineTo(0.5, H);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = PAPER.rule;
  for (let sy = 0; sy < H; sy += 18) {
    ctx.fillStyle = PAPER.bg;
    ctx.beginPath();
    ctx.arc(W, sy + 9, 4, Math.PI / 2, Math.PI * 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W - 0.5, sy);
    ctx.lineTo(W - 0.5, sy + 5);
    ctx.arc(W - 0.5, sy + 9, 4, -Math.PI / 2, Math.PI / 2, true);
    ctx.lineTo(W - 0.5, sy + 18);
    ctx.stroke();
  }

  // top row
  text("KARITA", padL, 29, "600 14px " + DISPLAY, PAPER.ink, "left", "4px");
  text(f.serial, W - padR, 29, "12px " + MONO, PAPER.muted, "right", "0.7px");
  hline(topH);

  // slot
  text(f.slot, W / 2, topH + 110, "500 96px " + DISPLAY, PAPER.ink, "center");
  text(f.where, W / 2, topH + 142, "12px " + MONO, PAPER.muted, "center", "1.2px");
  hline(topH + heroH);

  // spec list
  let y = topH + heroH + 14;
  f.rows.forEach((row) => {
    y += rowH;
    text(row[0].toUpperCase(), padL, y - 8, "14px " + MONO, PAPER.muted, "left", "1px");
    text(row[1], W - padR, y - 8, "14px " + MONO, PAPER.ink, "right");
  });
  hline(topH + heroH + specH);

  // QR block
  const by = topH + heroH + specH + 26;
  ctx.fillStyle = PAPER.ink;
  qrCells(r.serial).forEach(([cx, cy]) => {
    ctx.fillRect(padL + cx * 8 + 0.6, by + cy * 8 + 0.6, 6.8, 6.8);
  });

  // stamp
  ctx.save();
  ctx.globalAlpha = 0.78;
  const color = f.stampMuted ? PAPER.muted : PAPER.stamp;
  const size = f.stampMuted ? 20 : 28;
  ctx.font = "600 " + size + "px " + DISPLAY;
  if ("letterSpacing" in ctx) ctx.letterSpacing = size * 0.24 + "px";
  const label = f.stamp.toUpperCase();
  const bw = ctx.measureText(label).width + 32;
  const bh = size + 14;
  ctx.translate(W - 48 - bw / 2, by + 32);
  ctx.rotate((-8 * Math.PI) / 180);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, size * 0.12, 1);
  ctx.restore();

  return canvas;
}

/** Draw, wait for the webfonts, then hand the browser a PNG to download. */
export function saveTicket(r) {
  const fonts = ["600 14px Fraunces", "500 96px Fraunces", "14px 'IBM Plex Mono'"].map((f) =>
    document.fonts ? document.fonts.load(f) : Promise.resolve(),
  );
  return Promise.all(fonts)
    .catch(() => {})
    .then(
      () =>
        new Promise((resolve, reject) => {
          drawTicket(r).toBlob((blob) => {
            if (!blob) return reject(new Error("Couldn't create the image. Try printing the page instead."));
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "karita-ticket-" + r.serial + ".png";
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            resolve();
          }, "image/png");
        }),
    );
}

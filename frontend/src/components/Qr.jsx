// Placeholder pattern seeded from the serial: QR-style finder squares and
// timing lines with pseudo-random data modules. Decorative, not scannable —
// swap for a real encoder once the backend issues verification codes.

function seeded(seedText) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function qrMatrix(seedText) {
  const n = 21;
  const rand = seeded(seedText);
  const grid = Array.from({ length: n }, () => Array(n).fill(false));
  const reserved = Array.from({ length: n }, () => Array(n).fill(false));

  const finder = (ox, oy) => {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const gx = ox + x;
        const gy = oy + y;
        if (gx < 0 || gy < 0 || gx >= n || gy >= n) continue;
        const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
        grid[gy][gx] = ring === 3 || ring <= 1;
        reserved[gy][gx] = true;
      }
    }
  };

  finder(0, 0);
  finder(n - 7, 0);
  finder(0, n - 7);

  for (let i = 8; i < n - 8; i++) {
    grid[6][i] = grid[i][6] = i % 2 === 0;
    reserved[6][i] = reserved[i][6] = true;
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!reserved[y][x]) grid[y][x] = rand() < 0.5;
    }
  }
  return grid;
}

/** The 21×21 pattern used on the ticket block. */
export default function Qr({ seed, label }) {
  let d = "";
  qrMatrix(seed).forEach((row, y) =>
    row.forEach((on, x) => {
      if (on) d += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return (
    <svg viewBox="0 0 21 21" role="img" aria-label={label}>
      <path d={d} fill="currentColor" />
    </svg>
  );
}

/** The coarser 8×8 block on the printed slip; also drawn onto the canvas. */
export function qrCells(seedText) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const cells = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      const corner = (x < 2 && y < 2) || (x > 5 && y < 2) || (x < 2 && y > 5);
      if (corner || (h >>> 0) % 2) cells.push([x, y]);
    }
  }
  return cells;
}

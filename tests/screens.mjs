// Responsive evidence: captures every page at four viewport widths and asserts
// none of them overflow horizontally.
//
// Two jobs in one pass, because they need the same setup:
//
//   1. Screenshots into docs/screens/, which are the mock-ups the brief asks for
//      (§3: "demonstrate layout adaptability across devices").
//   2. A measured check of the responsiveness quality target in
//      docs/REQUIREMENTS.md — "no horizontal scroll and no overlap from 390 px
//      to 1920 px on all 10 pages". That row used to read "manual check"; this
//      script is what makes it a number instead of a claim. Exits non-zero if
//      any page at any width scrolls sideways.
//
//   npm run screens              (needs Java 17+, Maven, PostgreSQL, and Chrome/Chromium)
//   SKIP_BUILD=1 npm run screens (reuse backend/target/*.jar)
//   CHROME=/path/to/chrome npm run screens
//
// Shares its harness shape with smoke.mjs deliberately: same throwaway `smoke`
// profile, same raw DevTools protocol over a WebSocket, no dependencies.

import { spawn, execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";

const ROOT = new URL("..", import.meta.url).pathname;
const BACKEND = join(ROOT, "backend");
const OUT = join(ROOT, "docs", "screens");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 390: iPhone 12/13 mini and the narrowest width the CSS claims to support.
// 768: iPad portrait. 1280: laptop. 1920: desktop.
const WIDTHS = [390, 768, 1280, 1920];

// Tall pages are tall because of seeded data, not because of design: the
// attendant board renders ~60 rows and runs to 3,600 px. A mock-up should show
// the layout, so the shot stops here and the rest of the table is simply not
// pictured. The overflow check below still measures the whole document.
const MAX_SHOT_HEIGHT = 1400;

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const c of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try {
      return execSync(`command -v ${c}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {}
  }
  throw new Error("Chrome not found. Set CHROME=/path/to/chrome.");
}

// ---- server --------------------------------------------------------------------

function buildJar() {
  if (!process.env.SKIP_BUILD) {
    let mvn = "mvn";
    try {
      execSync("command -v mvn", { stdio: "ignore" });
    } catch {
      mvn = "./mvnw";
    }
    console.log("Building backend…");
    execSync(`${mvn} -q -DskipTests package`, { cwd: BACKEND, stdio: "inherit" });
  }
  const jar = readdirSync(join(BACKEND, "target")).find((f) => /\.jar$/.test(f) && !f.endsWith("-plain.jar"));
  if (!jar) throw new Error("backend jar not found; run without SKIP_BUILD");
  return join(BACKEND, "target", jar);
}

const JAR = buildJar();
let server;

async function startServer(port) {
  server = spawn("java", ["-jar", JAR, "--spring.profiles.active=smoke", `--server.port=${port}`,
    `--karita.clock-offset=${clockOffsetToMorning()}`], {
    cwd: BACKEND,
    stdio: process.env.SHOW_SERVER ? "inherit" : "ignore",
  });
  for (let i = 0; i < 240; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@karita.rw", password: "karita123" }),
      });
      if (res.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error("backend did not start (set SHOW_SERVER=1 to see its log)");
}

function stopServer() {
  return new Promise((resolve) => {
    if (!server || server.exitCode !== null) return resolve();
    server.once("exit", resolve);
    server.kill("SIGTERM");
  });
}

// ---- browser -------------------------------------------------------------------

const profile = mkdtempSync(join(tmpdir(), "karita-screens-"));
const debugPort = await freePort();
const chrome = spawn(findChrome(), [
  "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });

let target;
for (let i = 0; i < 100 && !target; i++) {
  await sleep(100);
  try {
    const list = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
    target = list.find((t) => t.type === "page");
  } catch {}
}
if (!target) throw new Error("could not attach to Chrome");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));

let msgId = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++msgId;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

/**
 * Evaluate an expression in the page and bring the result back.
 *
 * Elements can't come back by value: React hangs a fiber off every DOM node it
 * renders, and the serializer gives up walking it ("Object reference chain is
 * too long"). Every check in this file only asks whether an element is there,
 * so a node is handed back as `true` and every other kind of result is left
 * exactly as it was.
 */
async function js(expr) {
  const wrapped = `(() => { const v = (${expr}); return v instanceof Node ? true : v; })()`;
  const res = await send("Runtime.evaluate", { expression: wrapped, awaitPromise: true, returnByValue: true });
  if (res.error) throw new Error(`page error in: ${expr}\n${res.error.message}`);
  if (res.result?.exceptionDetails) {
    throw new Error(`page error in: ${expr}\n${res.result.exceptionDetails.exception?.description}`);
  }
  return res.result?.result?.value;
}

async function waitFor(expr, label, timeout = 15000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await js(expr);
      if (last) return last;
    } catch {}
    await sleep(80);
  }
  throw new Error(`timed out waiting for ${label || expr} (last: ${JSON.stringify(last)})`);
}

let BASE;
const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;

/**
 * Set a form control's value the way a person would, not the way a script
 * would. React installs its own `value` setter on every controlled input to
 * track what it last rendered; assigning `el.value = x` goes through that
 * setter, so by the time the input event fires React believes nothing changed
 * and drops it. Going through the *prototype's* setter leaves the tracker
 * stale, which is exactly what tells React a real edit happened. This is the
 * same trick React's own testing library uses.
 */
const SET_NATIVE = `((el, prop, value) => {
  const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), prop);
  if (d && d.set) d.set.call(el, value); else el[prop] = value;
})`;
const click = (sel) => js(`${q(sel)}.click()`);
const type = (sel, value) =>
  js(`(() => {
    const i = ${q(sel)};
    ${SET_NATIVE}(i, "value", ${JSON.stringify(value)});
    i.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);

/**
 * The app is only fully reachable during opening hours (facilities close at
 * 22:00, and the attendant screen ignores reservations that have ended), so a
 * suite run late in the evening fails on the clock rather than on the code.
 * Pin the server's notion of now to 10:00 local on the day it runs, which also
 * makes the run deterministic whenever it happens.
 */
function clockOffsetToMorning(hour = 10) {
  const now = new Date();
  // Reinterpret the instant as Kigali wall time, so both sides of the
  // subtraction live in the same frame and the difference is the real shift.
  const local = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Kigali" }));
  const target = new Date(local);
  target.setHours(hour, 0, 0, 0);
  return `PT${Math.round((target - local) / 1000)}S`;
}

/** Same reason as smoke.mjs: after 20:00 "today" no longer offers a 2-hour slot. */
function tomorrow() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", { timeZone: "Africa/Kigali" });
}

async function setWidth(width) {
  // height is a floor only — captureBeyondViewport grows the shot to the full
  // document. deviceScaleFactor 1 keeps the PNGs small enough to commit.
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height: 900,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
}

async function signIn(email, password = "karita123") {
  // Navigate rather than fetch: smoke.mjs can use a relative fetch("/logout")
  // because a page is already loaded by the time it signs in, but here the
  // first sign-in happens on about:blank, whose opaque origin blocks fetch
  // outright. GET /logout clears the session and redirects to /login.html,
  // which gets us to the form in one hop anyway.
  await send("Page.navigate", { url: BASE + "/logout" });
  await waitFor(q("#signin-form"), "sign-in form");
  await type("#email", email);
  await type("#password", password);
  await click("#signin-form button[type=submit]");
  await waitFor(`!location.pathname.endsWith("login.html")`, `sign in as ${email}`);
}

async function signOut() {
  await send("Page.navigate", { url: BASE + "/logout" });
  await waitFor(q("#signin-form"), "sign-out lands on the sign-in page");
}

// ---- the pages ------------------------------------------------------------------

const port = await freePort();
BASE = `http://localhost:${port}`;
await startServer(port);
await send("Runtime.enable");
await send("Page.enable");

/**
 * pay.html needs an unpaid reservation and ticket.html needs a paid one, so
 * book two bays up front and keep their serials. Done at 1280 because the
 * flow is only a means to a serial here, not the thing under test.
 */
async function bookOne(facility, duration) {
  await send("Page.navigate", { url: `${BASE}/facility.html?id=${facility}&duration=${duration}&date=${tomorrow()}` });
  await waitFor(`${q(".cell--available:not(:disabled)")}`, `a free bay at ${facility}`);
  await click(".cell--available:not(:disabled)");
  await type("#plate", "rad 482 c");
  await click("#reserve-btn");
  await waitFor(`location.pathname.endsWith("pay.html")`, "payment page");
  return new URL(await js("location.href")).searchParams.get("serial");
}

await setWidth(1280);
await signIn("driver@karita.rw");

const paidSerial = await bookOne("bk-arena", "2h");
await waitFor(`!${q("#pay-btn")}.disabled`, "pay enabled");
await type("#phone", "0788 123 456");
await click("#pay-btn");
await waitFor(`location.pathname.endsWith("ticket.html")`, "ticket page");

const pendingSerial = await bookOne("amahoro-stadium", "1h");

const PAGES = [
  { file: "login.html", role: null, ready: q("#signin-form"), label: "Sign in" },
  { file: "register.html", role: null, ready: q("#register-form"), label: "Register" },
  { file: "home.html", role: "driver@karita.rw", ready: "document.readyState === 'complete'", label: "Driver home" },
  { file: "browse.html", role: "driver@karita.rw", ready: q("#results-body tr"), label: "Browse facilities" },
  {
    file: "facility.html",
    role: "driver@karita.rw",
    query: () => `?id=bk-arena&duration=2h&date=${tomorrow()}`,
    ready: q(".cell--available"),
    label: "Facility bay map",
  },
  {
    file: "pay.html",
    role: "driver@karita.rw",
    query: () => `?serial=${pendingSerial}`,
    ready: `!${q("#pay-btn")}.disabled`,
    label: "Payment",
  },
  {
    file: "ticket.html",
    role: "driver@karita.rw",
    query: () => `?serial=${paidSerial}`,
    ready: `${q("#t-stamp")}.textContent.length > 0`,
    label: "Ticket",
  },
  { file: "reservations.html", role: "driver@karita.rw", ready: q(".rstub"), label: "My reservations" },
  { file: "attendant.html", role: "attendant@karita.rw", ready: q("#today-body tr"), label: "Attendant board" },
  { file: "admin.html", role: "admin@karita.rw", ready: "document.readyState === 'complete'", label: "Admin console" },
];

// ---- capture --------------------------------------------------------------------

// Clear previous PNGs only — docs/screens/README.md is hand-written and
// indexes these images, so a blanket rmSync on the directory would delete it.
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) {
  if (f.endsWith(".png")) rmSync(join(OUT, f));
}

console.log(`\nCapturing ${PAGES.length} pages × ${WIDTHS.length} widths → docs/screens/\n`);

const overflows = [];
const rows = [];
let currentRole = "driver@karita.rw";

for (const page of PAGES) {
  if (page.role !== currentRole) {
    if (page.role === null) await signOut();
    else await signIn(page.role);
    currentRole = page.role;
  }

  const cells = [];
  for (const width of WIDTHS) {
    await setWidth(width);
    const url = BASE + "/" + page.file + (page.query ? page.query() : "");
    await send("Page.navigate", { url });
    await sleep(200);
    await waitFor(page.ready, `${page.file} at ${width}px`);
    // Let fonts settle and any entry transition finish before the shot.
    await sleep(350);

    // Measuring this correctly took two attempts, so the reasoning is worth
    // recording. document.documentElement.scrollWidth looks like the obvious
    // check, but it reports the unclipped union of every descendant box and
    // ignores intervening scroll containers — so a wide table correctly
    // contained inside .table-wrap (overflow-x: auto) still inflates it, and
    // the page gets flagged while being perfectly fine.
    //
    // The ground truth is whether the window can actually be scrolled
    // sideways. Ask the browser to scroll right and see whether it moves.
    const metrics = await js(`(() => {
      const before = window.scrollX;
      window.scrollTo(9999, 0);
      const maxScrollX = window.scrollX;
      window.scrollTo(before, 0);

      const vw = document.documentElement.clientWidth;
      const path = (el) => {
        const parts = [];
        for (let e = el; e && e.nodeType === 1 && parts.length < 4; e = e.parentElement) {
          parts.unshift(e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") +
            (typeof e.className === "string" && e.className.trim()
              ? "." + e.className.trim().split(/\\s+/).join(".") : ""));
        }
        return parts.join(" > ");
      };
      // An element inside a clipping ancestor cannot move the page, so it is
      // not a responsiveness defect — report only the ones that escape.
      const clippedBy = (el) => {
        for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) {
          const ox = getComputedStyle(e).overflowX;
          if (ox === "auto" || ox === "hidden" || ox === "scroll") return true;
        }
        return false;
      };
      const offenders = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && Math.ceil(r.right) > vw + 1 && !clippedBy(el)) {
          offenders.push(path(el) + " (right " + Math.ceil(r.right) + "px)");
        }
      }
      return JSON.stringify({
        maxScrollX,
        bodyScrollWidth: document.body.scrollWidth,
        clientWidth: vw,
        offenders: offenders.slice(0, 5),
      });
    })()`);
    const { maxScrollX, bodyScrollWidth, clientWidth, offenders } = JSON.parse(metrics);
    // 1px of slack absorbs sub-pixel layout rounding.
    const overflow = maxScrollX > 1 || bodyScrollWidth - clientWidth > 1;
    if (overflow) overflows.push({ page: page.file, width, maxScrollX, bodyScrollWidth, clientWidth, offenders });
    cells.push(overflow ? `+${Math.max(maxScrollX, bodyScrollWidth - clientWidth)}px ✗` : "ok");

    const fullHeight = await js(`document.documentElement.scrollHeight`);
    const shot = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      optimizeForSpeed: false,
      clip: { x: 0, y: 0, width, height: Math.min(fullHeight, MAX_SHOT_HEIGHT), scale: 1 },
    });
    const file = join(OUT, `${page.file.replace(/\.html$/, "")}-${width}.png`);
    writeFileSync(file, Buffer.from(shot.result.data, "base64"));
  }
  rows.push([page.file, ...cells]);
  console.log(`  ${page.file.padEnd(20)} ${cells.map((c) => c.padEnd(10)).join("")}`);
}

// ---- report ---------------------------------------------------------------------

const written = readdirSync(OUT).filter((f) => f.endsWith(".png"));
const bytes = written.reduce((n, f) => n + statSync(join(OUT, f)).size, 0);

console.log(`\n${written.length} screenshots, ${(bytes / 1024 / 1024).toFixed(1)} MB total`);

if (overflows.length) {
  console.log(`\nFAIL — horizontal overflow at ${overflows.length} page/width combination(s):`);
  for (const o of overflows) {
    console.log(`  ${o.page} @ ${o.width}px — scrolls ${o.maxScrollX}px sideways, body ${o.bodyScrollWidth}px in a ${o.clientWidth}px viewport`);
    for (const el of o.offenders) console.log(`      ${el}`);
  }
} else {
  console.log(`No horizontal overflow at any of ${WIDTHS.join("/")} px on ${PAGES.length} pages.`);
}

// ---- teardown -------------------------------------------------------------------

ws.close();
chrome.kill();
await stopServer();
// Chrome flushes its profile asynchronously on exit, so an immediate remove
// races it and throws ENOTEMPTY. It's a temp dir either way.
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
} catch {}
process.exit(overflows.length ? 1 : 0);

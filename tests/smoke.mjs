// End-to-end smoke tests: builds and starts the Spring Boot backend on the
// throwaway `karita_test` database (profile "smoke": rebuilt + reseeded on
// every start), drives headless Chrome over the DevTools protocol (no
// dependencies), and checks each role's main flows.
//
//   npm test                 (needs Java 17+, Maven, PostgreSQL, and Chrome/Chromium)
//   CHROME=/path/to/chrome npm test
//   SKIP_BUILD=1 npm test    (reuse backend/target/*.jar)

import { spawn, execSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";

const ROOT = new URL("..", import.meta.url).pathname;
const BACKEND = join(ROOT, "backend");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  server = spawn("java", ["-jar", JAR, "--spring.profiles.active=smoke", `--server.port=${port}`], {
    cwd: BACKEND,
    stdio: process.env.SHOW_SERVER ? "inherit" : "ignore",
  });
  // Ready = demo data seeded, i.e. the demo driver can sign in.
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

const profile = mkdtempSync(join(tmpdir(), "karita-smoke-"));
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
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));

let msgId = 0;
const pending = new Map();
const pageErrors = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
  if (m.method === "Runtime.exceptionThrown") {
    pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++msgId;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

async function js(expr) {
  const res = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (res.result?.exceptionDetails) throw new Error(`page error in: ${expr}\n${res.result.exceptionDetails.exception?.description}`);
  return res.result?.result?.value;
}

async function waitFor(expr, label, timeout = 6000) {
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
/**
 * Tomorrow in Kigali, as yyyy-MM-dd. The booking tests pin a date because the
 * facility page only offers start times that still fit before the 22:00 close —
 * so "today" stops offering a 2-hour slot at 20:00, and the suite would fail in
 * the evening for reasons that have nothing to do with the code under test.
 */
function tomorrow() {
  const kigali = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", {
    timeZone: "Africa/Kigali",
  });
  return kigali;
}

async function open(path, ready = "document.readyState === 'complete'") {
  await send("Page.navigate", { url: BASE + path });
  await sleep(150);
  await waitFor(ready, `load ${path}`, 15000);
}

const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
const text = (sel) => js(`${q(sel)}?.textContent.trim()`);
const click = (sel) => js(`${q(sel)}.click()`);
const type = (sel, value) =>
  js(`(() => { const i = ${q(sel)}; i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);

async function signIn(email, password = "karita123") {
  await js(`fetch("/logout")`);
  await open("/login.html", `${q("#signin-form")}`);
  await type("#email", email);
  await type("#password", password);
  await click("#signin-form button[type=submit]");
  await waitFor(`!location.pathname.endsWith("login.html")`, `sign in as ${email}`);
}

// ---- test runner ----------------------------------------------------------------

const results = [];
async function test(name, fn) {
  const before = pageErrors.length;
  try {
    await fn();
    if (pageErrors.length > before) throw new Error("uncaught page error: " + pageErrors.slice(before).join(" | "));
    results.push([true, name]);
    console.log(`  ok    ${name}`);
  } catch (err) {
    results.push([false, name]);
    console.log(`  FAIL  ${name}\n        ${String(err.message).split("\n").join("\n        ")}`);
  }
}

function eq(actual, expected, what) {
  if (actual !== expected) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function ok(value, what) {
  if (!value) throw new Error(what);
}

// ---- tests ---------------------------------------------------------------------

const port = await freePort();
BASE = `http://localhost:${port}`;
await startServer(port);
await send("Runtime.enable");
await send("Page.enable");
console.log(`Karita smoke tests against ${BASE}\n`);

await test("login: wrong password shows a clear message", async () => {
  await open("/login.html", q("#signin-form"));
  await type("#email", "driver@karita.rw");
  await type("#password", "wrong-password");
  await click("#signin-form button[type=submit]");
  await waitFor(`${q("#signin-status")}.textContent.includes("incorrect")`, "error message");
});

await test("register: validates, rejects duplicate email, then creates an account", async () => {
  await open("/register.html", q("#register-form"));
  await click("#register-form button[type=submit]");
  await waitFor(`${q("#fullName-error")}.textContent`, "client-side errors");
  await type("#fullName", "Smoke Test");
  await type("#email", "driver@karita.rw");
  await type("#password", "parking123");
  await type("#plate", "rag 900 z");
  await click("#register-form button[type=submit]");
  await waitFor(`${q("#email-error")}.textContent.includes("already registered")`, "duplicate email error");
  await type("#email", "smoke@karita.rw");
  await click("#register-form button[type=submit]");
  await waitFor(`location.pathname.endsWith("home.html")`, "home after register");
});

await test("driver: navigating between pages never loses the page or the session", async () => {
  await signIn("driver@karita.rw");
  for (const [sel, page] of [
    ['.appbar__nav a[href="browse.html"]', "browse.html"],
    ['.appbar__nav a[href="reservations.html"]', "reservations.html"],
    [".appbar__mark", "home.html"],
  ]) {
    await waitFor(q(sel), sel);
    await click(sel);
    await waitFor(`location.pathname.endsWith(${JSON.stringify(page)}) && document.querySelector(".appbar__inner")`, page);
  }
  await js("history.back()");
  await waitFor(`location.pathname.endsWith("reservations.html")`, "back button");
  await open("/login.html");
  eq(await js("location.pathname"), "/home.html", "signed-in /login.html redirects home");
});

let serial;
await test("driver: reserve with plate, pay by mobile money, see the PAID ticket", async () => {
  await open(`/facility.html?id=bk-arena&duration=2h&date=${tomorrow()}`, `${q(".cell--available:not(:disabled)")}`);
  await click(".cell--available:not(:disabled)");
  await type("#plate", "");
  await click("#reserve-btn");
  await waitFor(`${q("#plate-error")}.textContent`, "plate required");
  await type("#plate", "rad 482 c");
  await click("#reserve-btn");
  await waitFor(`location.pathname.endsWith("pay.html")`, "payment page");
  serial = new URL(await js("location.href")).searchParams.get("serial");
  await waitFor(`!${q("#pay-btn")}.disabled`, "pay enabled");
  await type("#phone", "0788 123 456");
  await click("#pay-btn");
  await waitFor(`location.pathname.endsWith("ticket.html")`, "ticket page");
  await waitFor(`${q("#t-stamp")}.textContent === "Paid"`, "PAID stamp");
  eq(await text("#t-plate"), "RAD 482 C", "plate on ticket");
});

await test("driver: declined card shows an error and keeps the form", async () => {
  await open(`/facility.html?id=amahoro-stadium&duration=1h&date=${tomorrow()}`, q(".cell--available:not(:disabled)"));
  await click(".cell--available:not(:disabled)");
  await click("#reserve-btn");
  await waitFor(`location.pathname.endsWith("pay.html")`, "payment page");
  await waitFor(`!${q("#pay-btn")}.disabled`, "pay enabled");
  await click("#m-card");
  await type("#cardNumber", "4000 0000 0000 0002");
  await type("#expiry", "12/30");
  await type("#cvc", "123");
  await click("#pay-btn");
  await waitFor(`${q("#pay-error")}.textContent.includes("declined")`, "declined message");
});

await test("driver: reschedule shows field errors, cancel works inline", async () => {
  await open("/reservations.html", q(".js-reschedule"));
  await click(".js-reschedule");
  await waitFor(q("[id^=end-]"), "reschedule panel");
  await js(`(() => { const i = ${q("[id^=end-]")}; i.value = i.value.slice(0, 11) + "23:00"; })()`);
  await click(".resched button[type=submit]");
  await waitFor(`${q(".resched .field__error:not(:empty)")}?.textContent.includes("closes")`, "closing-time error");
  const before = await js(`document.querySelectorAll(".rstub").length`);
  await js(`[...document.querySelectorAll(".rstub .linkbtn")].filter(b => b.textContent === "Cancel").pop().click()`);
  await waitFor(`[...document.querySelectorAll(".linkbtn")].some(b => b.textContent === "Yes, cancel")`, "inline confirm");
  await js(`[...document.querySelectorAll(".linkbtn")].find(b => b.textContent === "Yes, cancel").click()`);
  await waitFor(`document.querySelectorAll(".rstub").length === ${before - 1}`, "one fewer upcoming");
});

await test("roles: each role is kept to its own pages", async () => {
  await open("/admin.html");
  eq(await js("location.pathname"), "/home.html", "driver opening admin.html");
  eq(await js(`fetch("/api/admin/facilities").then(r => r.status)`), 403, "driver calling admin API");
  await signIn("attendant@karita.rw");
  eq(await js("location.pathname"), "/attendant.html", "attendant lands on attendant.html");
  await open("/browse.html");
  eq(await js("location.pathname"), "/attendant.html", "attendant opening browse.html");
});

await test("attendant: verify plate, mark occupied, release the slot", async () => {
  await open("/attendant.html", `${q("#today-body tr")}`);
  await type("#lookup-input", "rad482c");
  await click("#lookup-btn");
  await waitFor(`${q(".vticket__stamp")}?.textContent === "Paid"`, "PAID match");
  await js(`[...document.querySelectorAll(".vticket__actions .btn")].find(b => b.textContent === "Mark as occupied").click()`);
  await waitFor(`${q(".vticket__stamp")}?.textContent === "Occupied"`, "occupied");
  await js(`[...document.querySelectorAll(".vticket__actions .btn")].find(b => b.textContent === "Release slot").click()`);
  await waitFor(`${q(".vticket__stamp")}?.textContent === "Left"`, "released");
  await waitFor(`[...document.querySelectorAll("#today-body .today__state")].some(c => c.textContent === "Left")`, "today list updated");
});

await test("attendant: unknown plate shows the no-match panel", async () => {
  await type("#lookup-input", "ZZ 000 Z");
  await click("#lookup-btn");
  await waitFor(`${q(".miss__text")}?.textContent.includes("No reservation")`, "no-match panel");
});

await test("admin: facility and slot CRUD with validation", async () => {
  await signIn("admin@karita.rw");
  eq(await js("location.pathname"), "/admin.html", "admin lands on admin.html");
  await waitFor(`${q("#facilities-body tr")}`, "facility rows");
  await click("#facility-new");
  await click("#facility-create button[type=submit]");
  await waitFor(`${q("#nf-name-error")}.textContent`, "client validation");
  await type("#nf-name", "Smoke Test Lot");
  await type("#nf-address", "KN 5 Rd");
  await type("#nf-levels", "G");
  await click("#facility-create button[type=submit]");
  await waitFor(`location.hash.startsWith("#slots?facility=smoke-test-lot")`, "goes to slots of new facility");
  await waitFor(`!${q("#slots-empty")}.hidden`, "no slots yet");
  await click("#slot-new");
  await type("#ns-slotNumber", "a1");
  await click("#slot-create button[type=submit]");
  await waitFor(`document.querySelectorAll("#slots-body tr").length === 1`, "slot created");
  await type("#ns-slotNumber", "A1");
  await click("#slot-create button[type=submit]");
  await waitFor(`${q("#ns-slotNumber-error")}.textContent.includes("already exists")`, "duplicate slot error");
  await js(`[...document.querySelectorAll("#slots-body .linkbtn")].find(b => b.textContent === "Deactivate").click()`);
  await waitFor(`${q("#slots-body .pill--inactive")}`, "deactivated");
  await js(`[...document.querySelectorAll("#slots-body .linkbtn")].find(b => b.textContent === "Delete").click()`);
  await js(`[...document.querySelectorAll("#slots-body .linkbtn")].find(b => b.textContent === "Yes, delete").click()`);
  await waitFor(`!${q("#slots-empty")}.hidden`, "slot deleted");
  await js(`location.hash = "#facilities"`);
  await waitFor(`${q('#facilities-body tr[data-id="smoke-test-lot"]')}`, "new facility listed");
  await js(`[...document.querySelectorAll('#facilities-body tr[data-id="smoke-test-lot"] .linkbtn')].find(b => b.textContent === "Delete").click()`);
  await js(`[...document.querySelectorAll('#facilities-body .linkbtn')].find(b => b.textContent === "Yes, delete").click()`);
  await waitFor(`!${q('#facilities-body tr[data-id="smoke-test-lot"]')}`, "facility deleted");
});

await test("admin: a facility with history can't be deleted", async () => {
  await js(`[...document.querySelectorAll('#facilities-body tr[data-id="kbc"] .linkbtn')].find(b => b.textContent === "Delete").click()`);
  await js(`[...document.querySelectorAll('#facilities-body .linkbtn')].find(b => b.textContent === "Yes, delete").click()`);
  await waitFor(`${q("#facilities-error")}.textContent.includes("history")`, "history guard");
});

await test("admin: reservations list filters, revenue table totals", async () => {
  await js(`location.hash = "#reservations"`);
  await waitFor(`document.querySelectorAll("#reservations-body tr").length > 3`, "reservations listed");
  await js(`(() => { const s = ${q("#res-status")}; s.value = "Cancelled"; s.dispatchEvent(new Event("change")); })()`);
  await waitFor(`[...document.querySelectorAll("#reservations-body .pill")].every(p => p.textContent === "CANCELLED") && document.querySelectorAll("#reservations-body tr").length > 0`, "cancelled filter");
  await js(`location.hash = "#revenue"`);
  await waitFor(`${q("#revenue-foot th")}?.textContent === "All facilities"`, "totals row");
  ok((await js(`document.querySelectorAll("#revenue-body tr").length`)) >= 24, "a row per facility");
});

await test("robustness: server restart sends you to sign-in with a reason", async () => {
  await stopServer();
  await startServer(port);
  await open("/admin.html");
  await waitFor(`location.search.includes("reason=expired")`, "expired redirect");
  await waitFor(`${q("#signin-status")}.textContent.includes("session ended")`, "session ended message");
});

await test("robustness: server down shows the can't-reach banner", async () => {
  await signIn("driver@karita.rw");
  await open("/browse.html", q("#results-body tr"));
  await stopServer();
  await js(`(() => { const r = document.querySelector("input[name=duration][value='2h']"); r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  await waitFor(`${q(".offline")}?.textContent.includes("Can't reach")`, "offline banner");
});

// ---- done ----------------------------------------------------------------------

ws.close();
chrome.kill();
await stopServer();
await sleep(200);
rmSync(profile, { recursive: true, force: true });

const failed = results.filter((r) => !r[0]).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

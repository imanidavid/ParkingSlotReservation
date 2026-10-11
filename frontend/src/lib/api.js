// The one way the front end talks to the backend. Every call goes through
// api(); see docs/API.md for the contract.

let offlineListeners = [];
let offline = false;

function setOffline(next) {
  if (offline === next) return;
  offline = next;
  offlineListeners.forEach((fn) => fn(offline));
}

/** Subscribe to the server-unreachable flag; returns an unsubscribe. */
export function onOffline(fn) {
  offlineListeners.push(fn);
  fn(offline);
  return () => {
    offlineListeners = offlineListeners.filter((f) => f !== fn);
  };
}

export async function api(path, options = {}) {
  const init = { method: options.method || "GET", credentials: "same-origin", headers: {} };
  if (options.body) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  let res;
  try {
    res = await fetch(path, init);
  } catch {
    // fetch only rejects when the server can't be reached at all
    setOffline(true);
    const err = new Error("Can't reach the Karita server.");
    err.status = 0;
    throw err;
  }
  setOffline(false);

  if (res.status === 401) {
    const here = window.location.pathname.replace(/^\//, "") + window.location.search + window.location.hash;
    window.location.assign("login.html?reason=expired&next=" + encodeURIComponent(here));
    return new Promise(() => {}); // navigating away; never settles
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Something went wrong. Try again.");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// The signed-in user, fetched once per page load and shared by every caller.
let mePromise = null;

export function me() {
  if (!mePromise) mePromise = api("/api/auth/me");
  return mePromise;
}

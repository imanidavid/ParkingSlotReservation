// Shared front-end helpers: DOM builder, formatting, API calls, the app top
// bar and THE TICKET. Exposed as window.Karita.
(function () {
  var SVG_NS = "http://www.w3.org/2000/svg";
  var numberFmt = new Intl.NumberFormat("en-US");

  // ---- DOM + formatting ---------------------------------------------------

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (value === undefined || value === null || value === false) return;
      if (key === "text") node.textContent = value;
      else node.setAttribute(key, value === true ? "" : value);
    });
    (children || []).forEach(function (child) {
      if (child == null) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  function num(n) {
    return numberFmt.format(n);
  }

  function rwf(amount) {
    return num(amount) + " RWF";
  }

  // "2026-09-24T08:00" -> { date: "2026-09-24", time: "08:00" }
  function splitStamp(value) {
    var parts = value.split("T");
    return { date: parts[0], time: parts[1].slice(0, 5) };
  }

  function windowLabel(start, end) {
    var s = splitStamp(start);
    var e = splitStamp(end);
    var endPart = s.date === e.date ? e.time : e.date + " " + e.time;
    return s.date + " " + s.time + " → " + endPart;
  }

  function statusPill(status) {
    return el("span", {
      class: "pill pill--" + status.toLowerCase().replace(/[^a-z]+/g, "-"),
      text: status.toUpperCase(),
    });
  }

  // ---- API ------------------------------------------------------------------

  function api(path, options) {
    options = options || {};
    var init = { method: options.method || "GET", credentials: "same-origin", headers: {} };
    if (options.body) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    return fetch(path, init).then(function (res) {
      hideOffline();
      if (res.status === 401) {
        var here = window.location.pathname.replace(/^\//, "") + window.location.search + window.location.hash;
        window.location.assign("login.html?reason=expired&next=" + encodeURIComponent(here));
        return new Promise(function () {}); // navigating away
      }
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || "Something went wrong. Try again.");
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    }, function () {
      // fetch only rejects when the server can't be reached at all
      showOffline();
      var err = new Error("Can't reach the Karita server.");
      err.status = 0;
      throw err;
    });
  }

  // ---- server-unreachable banner ----------------------------------------------

  var offlineBanner = null;

  function showOffline() {
    if (offlineBanner) return;
    var retry = el("button", { type: "button", class: "linkbtn", text: "Retry" });
    retry.addEventListener("click", function () { window.location.reload(); });
    offlineBanner = el("div", { class: "offline", role: "alert" }, [
      el("span", { text: "Can't reach the Karita server at " + window.location.origin + ". Is " }),
      el("code", { text: "npm start" }),
      el("span", { text: " running? " }),
      retry,
    ]);
    var header = document.querySelector("[data-appbar]");
    if (header) header.after(offlineBanner);
    else document.body.prepend(offlineBanner);
  }

  function hideOffline() {
    if (!offlineBanner) return;
    offlineBanner.remove();
    offlineBanner = null;
  }

  // Signed-in user, fetched once per page.
  var mePromise = null;
  function me() {
    if (!mePromise) mePromise = api("/api/auth/me");
    return mePromise;
  }

  // ---- top bar --------------------------------------------------------------
  // <header class="appbar" data-appbar data-active="browse"></header>

  var NAV = [
    { id: "browse", label: "Browse", href: "browse.html" },
    { id: "reservations", label: "Reservations", href: "reservations.html" },
    { id: "payments", label: "Payments", href: "reservations.html#past" },
  ];

  var NAV_ADMIN = [
    { id: "facilities", label: "Facilities", href: "admin.html#facilities" },
    { id: "slots", label: "Slots", href: "admin.html#slots" },
    { id: "reservations", label: "Reservations", href: "admin.html#reservations" },
    { id: "revenue", label: "Revenue", href: "admin.html#revenue" },
  ];

  var NAV_ATTENDANT = [
    { id: "verify", label: "Verify", href: "attendant.html#verify" },
    { id: "board", label: "Live board", href: "attendant.html#board" },
  ];

  function renderAppbar(header) {
    var active = header.getAttribute("data-active");
    var kind = header.getAttribute("data-nav");
    var items = kind === "attendant" ? NAV_ATTENDANT : kind === "admin" ? NAV_ADMIN : NAV;
    var home = kind === "attendant" ? "attendant.html" : kind === "admin" ? "admin.html" : "home.html";
    var nav = el("nav", { class: "appbar__nav", "aria-label": "Main" });
    items.forEach(function (item, i) {
      if (i) nav.appendChild(el("span", { class: "appbar__dot", "aria-hidden": "true", text: "·" }));
      nav.appendChild(el("a", {
        href: item.href,
        "aria-current": item.id === active ? "page" : null,
        text: item.label,
      }));
    });

    var role = el("span", { class: "appbar__role", text: " " });

    header.appendChild(el("div", { class: "appbar__inner" }, [
      el("a", { class: "appbar__mark", href: home, text: "KARITA" }),
      nav,
      el("div", { class: "appbar__meta" }, [
        role,
        el("div", { class: "theme-toggle", role: "group", "aria-label": "Colour theme" }, [
          el("button", { type: "button", "data-set-theme": "light", "aria-pressed": "false", text: "Light" }),
          el("span", { "aria-hidden": "true", text: "/" }),
          el("button", { type: "button", "data-set-theme": "dark", "aria-pressed": "false", text: "Dark" }),
        ]),
        el("a", { class: "link appbar__logout", href: "/logout", text: "Logout" }),
      ]),
    ]));

    me().then(function (me) {
      role.textContent = me.role.toUpperCase();
      if (me.facility) {
        role.appendChild(el("span", { class: "appbar__facility", text: " \u00b7 " + me.facility.toUpperCase() }));
      }
    }).catch(function () {});
  }

  document.querySelectorAll("[data-appbar]").forEach(renderAppbar);

  // ---- QR block -------------------------------------------------------------
  // Placeholder pattern seeded from the serial: QR-style finder squares and
  // timing lines with pseudo-random data modules. Swap for a real encoder
  // once the backend issues verification codes.

  function seeded(seedText) {
    var h = 2166136261;
    for (var i = 0; i < seedText.length; i++) {
      h ^= seedText.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return function () {
      h += 0x6d2b79f5;
      var t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function qrMatrix(seedText) {
    var n = 21;
    var rand = seeded(seedText);
    var grid = [];
    var reserved = [];
    for (var y = 0; y < n; y++) {
      grid.push([]);
      reserved.push([]);
      for (var x = 0; x < n; x++) {
        grid[y].push(false);
        reserved[y].push(false);
      }
    }

    function finder(ox, oy) {
      for (var y = -1; y <= 7; y++) {
        for (var x = -1; x <= 7; x++) {
          var gx = ox + x;
          var gy = oy + y;
          if (gx < 0 || gy < 0 || gx >= n || gy >= n) continue;
          var ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
          grid[gy][gx] = ring === 3 || ring <= 1;
          reserved[gy][gx] = true;
        }
      }
    }

    finder(0, 0);
    finder(n - 7, 0);
    finder(0, n - 7);

    for (var i = 8; i < n - 8; i++) {
      grid[6][i] = grid[i][6] = i % 2 === 0;
      reserved[6][i] = reserved[i][6] = true;
    }

    for (var yy = 0; yy < n; yy++) {
      for (var xx = 0; xx < n; xx++) {
        if (!reserved[yy][xx]) grid[yy][xx] = rand() < 0.5;
      }
    }
    return grid;
  }

  function qrSvg(seedText, label) {
    var grid = qrMatrix(seedText);
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 21 21");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
    var path = "";
    grid.forEach(function (row, y) {
      row.forEach(function (on, x) {
        if (on) path += "M" + x + " " + y + "h1v1h-1z";
      });
    });
    var p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", path);
    p.setAttribute("fill", "currentColor");
    svg.appendChild(p);
    return svg;
  }

  // ---- THE TICKET -----------------------------------------------------------
  // r: reservation from the API ({ serial, slot, facility, level, start, end,
  // duration, plate, amount, display }).

  function renderTicket(r) {
    var serial = "№ " + r.serial;
    var spec = el("dl", { class: "ticket__spec" });
    [
      ["Facility", (r.facility + " · Level " + r.level).toUpperCase()],
      ["Window", windowLabel(r.start, r.end)],
      ["Duration", r.duration],
      ["Plate", r.plate],
      ["Amount", rwf(r.amount), "ticket__amount"],
    ].forEach(function (row) {
      spec.appendChild(el("dt", { text: row[0] }));
      spec.appendChild(el("dd", { class: row[2], text: row[1] }));
    });

    return el("article", { class: "ticket", "aria-label": "Reservation ticket " + serial }, [
      el("div", { class: "ticket__stub" }, [
        el("span", { class: "ticket__serial", text: serial }),
      ]),
      el("div", { class: "ticket__body" }, [
        el("div", { class: "ticket__slot" }, [
          el("span", { class: "ticket__label", text: "Slot" }),
          el("span", { class: "ticket__slot-no", text: r.slot }),
        ]),
        spec,
        el("div", { class: "ticket__qr" }, [
          qrSvg(r.serial, "Entry code for ticket " + serial),
          el("span", { class: "ticket__qr-caption", text: serial }),
        ]),
      ]),
      el("span", { class: "ticket__stamp", "aria-hidden": "true", text: r.display === "Paid" ? "Paid" : "Confirmed" }),
    ]);
  }

  // Field-level error: red rule on the input + mono message beneath it.
  // The message element is "<input id>-error".
  function setFieldError(input, message) {
    var slot = document.getElementById(input.id + "-error");
    if (slot) slot.textContent = message || "";
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  function param(name) {
    return new URLSearchParams(window.location.search).get(name) || "";
  }

  // Plates: letters/digits/spaces, 4–12 chars, at least one digit (same rule as the server).
  function cleanPlate(value) {
    var p = String(value || "").toUpperCase().replace(/\s+/g, " ").trim();
    return /^[A-Z0-9 ]{4,12}$/.test(p) && /\d/.test(p) ? p : null;
  }

  window.Karita = {
    me: me,
    cleanPlate: cleanPlate,
    setFieldError: setFieldError,
    param: param,
    el: el,
    num: num,
    rwf: rwf,
    windowLabel: windowLabel,
    statusPill: statusPill,
    api: api,
    renderTicket: renderTicket,
  };
})();

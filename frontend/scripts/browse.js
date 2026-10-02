// Browse facilities: filter rail + sortable results table.
// Filters live in the URL so a filtered view can be shared or reloaded.
(function () {
  var K = window.Karita;
  var el = K.el;

  var form = document.getElementById("filters");
  var dateInput = document.getElementById("filter-date");
  var sortSelect = document.getElementById("sort");
  var body = document.getElementById("results-body");
  var summary = document.getElementById("results-summary");
  var empty = document.getElementById("results-empty");
  var availableHeading = document.getElementById("available-heading");
  var table = body.closest("table");

  var data = null; // last /api/facilities response
  var requestId = 0;

  var SORTS = {
    availability: function (a, b) { return b.available - a.available || a.name.localeCompare(b.name); },
    rate: function (a, b) { return a.rateFrom - b.rateFrom || b.available - a.available; },
    name: function (a, b) { return a.name.localeCompare(b.name); },
  };

  // ---- state <-> form <-> URL ----------------------------------------------

  function readForm() {
    var fd = new FormData(form);
    return {
      type: fd.getAll("type"),
      vehicle: fd.getAll("vehicle"),
      duration: fd.get("duration") || "1h",
      date: dateInput.value,
      sort: sortSelect.value,
    };
  }

  function applyToForm(state) {
    form.querySelectorAll("input[name=type]").forEach(function (i) { i.checked = state.type.indexOf(i.value) !== -1; });
    form.querySelectorAll("input[name=vehicle]").forEach(function (i) { i.checked = state.vehicle.indexOf(i.value) !== -1; });
    form.querySelectorAll("input[name=duration]").forEach(function (i) { i.checked = i.value === state.duration; });
    if (state.date) dateInput.value = state.date;
    if (SORTS[state.sort]) sortSelect.value = state.sort;
  }

  function fromUrl() {
    var q = new URLSearchParams(window.location.search);
    var list = function (key) { return (q.get(key) || "").split(",").filter(Boolean); };
    return {
      type: list("type"),
      vehicle: list("vehicle"),
      duration: q.get("duration") || "1h",
      date: q.get("date") || "",
      sort: q.get("sort") || "availability",
    };
  }

  function toUrl(state) {
    var q = new URLSearchParams();
    if (state.type.length) q.set("type", state.type.join(","));
    if (state.vehicle.length) q.set("vehicle", state.vehicle.join(","));
    if (state.duration !== "1h") q.set("duration", state.duration);
    if (data && state.date && state.date !== data.today) q.set("date", state.date);
    if (state.sort !== "availability") q.set("sort", state.sort);
    var qs = q.toString();
    history.replaceState(null, "", "browse.html" + (qs ? "?" + qs : ""));
  }

  // ---- data ---------------------------------------------------------------

  function load(state) {
    var id = ++requestId;
    table.setAttribute("aria-busy", "true");
    var q = new URLSearchParams({ duration: state.duration });
    if (state.date) q.set("date", state.date);

    return K.api("/api/facilities?" + q).then(function (res) {
      if (id !== requestId) return;
      data = res;
      dateInput.min = res.today;
      dateInput.value = res.date;
      render();
    }).catch(function (err) {
      if (id !== requestId) return;
      summary.textContent = err.message;
      summary.classList.add("error-text");
    }).then(function () {
      table.removeAttribute("aria-busy");
    });
  }

  // ---- render -------------------------------------------------------------

  function render() {
    var state = readForm();
    toUrl(state);

    var rows = data.facilities.filter(function (f) {
      if (state.type.length && state.type.indexOf(f.type) === -1) return false;
      if (state.vehicle.length && !state.vehicle.every(function (v) { return f.vehicles.indexOf(v) !== -1; })) return false;
      return true;
    }).sort(SORTS[state.sort]);

    var free = rows.reduce(function (n, f) { return n + f.available; }, 0);
    var isToday = data.date === data.today;
    var parts = [
      rows.length + (rows.length === 1 ? " facility" : " facilities"),
      K.num(free) + (free === 1 ? " slot" : " slots") + " available",
    ];
    if (data.window) parts.push((isToday ? "" : data.date + " ") + data.window.start + " → " + data.window.end);
    else parts.push("closed for the rest of today");
    summary.textContent = parts.join(" · ");
    summary.classList.remove("error-text");

    availableHeading.textContent = isToday ? "Available now" : "Available";

    body.textContent = "";
    rows.forEach(function (f) {
      var q = new URLSearchParams({ id: f.id, duration: data.duration });
      if (!isToday) q.set("date", data.date);
      var href = "facility.html?" + q;

      var row = el("tr", {}, [
        el("td", {}, [
          el("a", { class: "table__name", href: href, text: f.name }),
          el("span", { class: "table__type", text: f.type }),
        ]),
        el("td", { class: "table__muted col-location", text: f.address + ", " + f.city }),
        el("td", { class: "num table__muted col-total", text: K.num(f.totalSlots) }),
        el("td", { class: "num" + (f.available === 0 ? " avail--none" : ""), text: K.num(f.available) }),
        el("td", { class: "num", text: K.num(f.rateFrom) + " RWF/H" }),
        el("td", { class: "table__action" }, [
          el("a", { class: "link", href: href, tabindex: "-1", "aria-hidden": "true", text: "View slots →" }),
        ]),
      ]);
      row.addEventListener("click", function (event) {
        if (!event.target.closest("a")) window.location.assign(href);
      });
      body.appendChild(row);
    });

    table.hidden = rows.length === 0;
    empty.hidden = rows.length !== 0;
  }

  // ---- events -------------------------------------------------------------

  form.addEventListener("change", function (event) {
    var name = event.target.name;
    if (name === "duration" || name === "date") load(readForm());
    else if (data) render();
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
  });

  sortSelect.addEventListener("change", function () {
    if (data) render();
  });

  var initial = fromUrl();
  applyToForm(initial);
  load(initial);
})();

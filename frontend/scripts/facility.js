// Slot picker: the lot grid for one facility level + the reservation panel.
// State lives in the URL (id, level, date, duration, start).
(function () {
  var K = window.Karita;
  var el = K.el;

  var main = document.getElementById("facility");
  var picker = document.getElementById("picker");
  var nameEl = document.getElementById("facility-name");
  var subEl = document.getElementById("facility-sub");
  var levelsEl = document.getElementById("levels");
  var gridEl = document.getElementById("lot-grid");
  var windowEl = document.getElementById("lot-window");
  var legendEl = document.getElementById("legend");
  var form = document.getElementById("reserve-form");
  var selectedEl = document.getElementById("selected-slot");
  var durationsEl = document.getElementById("durations");
  var dateInput = document.getElementById("date");
  var startSelect = document.getElementById("start");
  var amountEl = document.getElementById("amount");
  var calcEl = document.getElementById("calc");
  var errorEl = document.getElementById("reserve-error");
  var plateInput = document.getElementById("plate");
  var vehicleSelect = document.getElementById("vehicle");
  var sampleNote = document.getElementById("sample-note");
  var reserveBtn = document.getElementById("reserve-btn");

  var params = new URLSearchParams(window.location.search);
  var state = {
    id: params.get("id") || "",
    level: params.get("level") || "",
    date: params.get("date") || "",
    duration: params.get("duration") || "1h",
    start: params.get("start") || "",
    vehicle: params.get("vehicle") || "",
    slot: null,
  };
  var detail = null;
  var requestId = 0;
  var submitting = false;

  // ---- data -----------------------------------------------------------------

  function load() {
    var id = ++requestId;
    main.setAttribute("aria-busy", "true");
    var q = new URLSearchParams({ duration: state.duration });
    ["level", "date", "start", "vehicle"].forEach(function (k) { if (state[k]) q.set(k, state[k]); });

    return K.api("/api/facilities/" + encodeURIComponent(state.id) + "?" + q)
      .then(function (d) {
        if (id !== requestId) return;
        detail = d;
        state.level = d.level;
        state.date = d.date;
        state.duration = d.duration;
        state.start = d.start || "";
        state.vehicle = d.vehicle || state.vehicle;
        reconcileSelection();
        syncUrl();
        render();
      })
      .catch(function (err) {
        if (id !== requestId) return;
        if (err.status === 404) return notFound();
        errorEl.textContent = err.message;
      })
      .then(function () {
        if (id === requestId) main.removeAttribute("aria-busy");
      });
  }

  // Keep the chosen slot if it's still free for the new window.
  function reconcileSelection() {
    if (!state.slot) return;
    var slot = findSlot(state.slot);
    if (!slot || slot.status !== "Available") {
      errorEl.textContent = state.slot + " is taken for that time. Pick another slot.";
      state.slot = null;
    } else if (!slot.fits) {
      errorEl.textContent = state.slot + " is a " + slot.vehicleType.toLowerCase() + " bay; pick one that fits your vehicle.";
      state.slot = null;
    }
  }

  function findSlot(id) {
    for (var r = 0; r < detail.rows.length; r++) {
      for (var s = 0; s < detail.rows[r].slots.length; s++) {
        if (detail.rows[r].slots[s].id === id) return detail.rows[r].slots[s];
      }
    }
    return null;
  }

  function syncUrl() {
    var q = new URLSearchParams({ id: state.id });
    if (detail.facility.levels.length > 1) q.set("level", state.level);
    if (state.date !== detail.minDate) q.set("date", state.date);
    if (state.duration !== "1h") q.set("duration", state.duration);
    if (state.start && state.start !== detail.startTimes[0]) q.set("start", state.start);
    if (state.vehicle) q.set("vehicle", state.vehicle);
    history.replaceState(null, "", "facility.html?" + q);
  }

  // ---- render -----------------------------------------------------------------

  function render() {
    var f = detail.facility;
    document.title = f.name + " · Karita";
    nameEl.textContent = f.name;
    subEl.textContent = (f.name + " · Level " + detail.level).toUpperCase();

    renderLevels();
    renderGrid();
    renderPanel();
  }

  function renderLevels() {
    var levels = detail.facility.levels;
    levelsEl.hidden = levels.length < 2;
    levelsEl.textContent = "";
    levelsEl.appendChild(el("span", { class: "levels__label", text: "Level" }));
    levels.forEach(function (name, i) {
      if (i) levelsEl.appendChild(el("span", { "aria-hidden": "true", text: "/" }));
      var btn = el("button", { type: "button", "aria-pressed": String(name === detail.level), text: name });
      btn.addEventListener("click", function () {
        if (name === state.level) return;
        state.level = name;
        state.slot = null;
        errorEl.textContent = "";
        load();
      });
      levelsEl.appendChild(btn);
    });
  }

  function renderGrid() {
    gridEl.textContent = "";
    var counts = { Available: 0, Reserved: 0, Occupied: 0, Inactive: 0, NoFit: 0 };
    sampleNote.hidden = !detail.facility.sampleTraffic;

    if (!detail.rows.length) {
      windowEl.textContent = "";
      gridEl.appendChild(el("p", { class: "empty", text: detail.window
        ? "This level has no slots yet."
        : "No start times left for this day. Pick another date." }));
      renderLegend(counts);
      return;
    }

    var w = detail.window;
    windowEl.textContent = detail.date + " " + w.start + " \u2192 " + w.end;
    gridEl.style.setProperty("--cols", detail.cols);

    detail.rows.forEach(function (row, i) {
      if (i && i % 2 === 0) {
        gridEl.appendChild(el("div", { class: "lot__aisle", "aria-hidden": "true" }, [
          el("span", { text: "Aisle" }),
        ]));
      }
      var line = el("div", { class: "lot__row", role: "group", "aria-label": "Row " + row.row }, [
        el("span", { class: "lot__rowlabel", "aria-hidden": "true", text: row.row }),
      ]);
      row.slots.forEach(function (slot) {
        var nofit = slot.status === "Available" && !slot.fits;
        if (nofit) counts.NoFit++;
        else counts[slot.status]++;
        var usable = slot.status === "Available" && slot.fits;
        var selected = slot.id === state.slot;
        var what = nofit
          ? slot.vehicleType.toLowerCase() + " bay, too small for your vehicle"
          : slot.status === "Inactive" ? "out of service" : slot.status.toLowerCase();
        var cell = el("button", {
          type: "button",
          class: "cell cell--" + (nofit ? "nofit" : slot.status.toLowerCase()) + (selected ? " cell--selected" : ""),
          "data-slot": slot.id,
          "aria-pressed": usable ? String(selected) : null,
          "aria-label": slot.id + ", " + (selected ? "selected" : what) + (usable ? ", " + slot.vehicleType.toLowerCase() + " bay" : ""),
          title: slot.vehicleType + " bay" + (usable ? "" : " \u00b7 " + what),
          disabled: !usable,
          text: slot.id,
        });
        // place by slot number so gaps in a row stay visible
        if (slot.col) cell.style.gridColumn = String(slot.col + 1);
        line.appendChild(cell);
      });
      gridEl.appendChild(line);
    });

    renderLegend(counts);
  }

  function renderLegend(counts) {
    legendEl.textContent = "";
    var items = [
      ["available", "Available", counts.Available],
      ["reserved", "Reserved", counts.Reserved],
      ["occupied", "Occupied", counts.Occupied],
    ];
    if (counts.NoFit) items.push(["nofit", "Too small for a " + (state.vehicle || "vehicle").toLowerCase(), counts.NoFit]);
    if (counts.Inactive) items.push(["inactive", "Out of service", counts.Inactive]);
    items.forEach(function (item) {
      legendEl.appendChild(el("li", { class: "legend__item" }, [
        el("span", { class: "legend__swatch cell--" + item[0], "aria-hidden": "true" }),
        el("span", { text: item[1] }),
        el("span", { class: "legend__count", text: String(item[2]) }),
      ]));
    });
  }

  function renderPanel() {
    selectedEl.textContent = state.slot || "—";
    selectedEl.classList.toggle("panel__slot--empty", !state.slot);

    // durations
    if (!durationsEl.children.length) {
      detail.durations.forEach(function (d) {
        var input = el("input", { type: "radio", name: "duration", value: d.id, id: "dur-" + d.id, class: "chip__input" });
        input.addEventListener("change", function () {
          state.duration = d.id;
          errorEl.textContent = "";
          load();
        });
        durationsEl.appendChild(input);
        durationsEl.appendChild(el("label", { class: "chip", for: "dur-" + d.id, text: d.label }));
      });
    }
    durationsEl.querySelectorAll("input").forEach(function (i) { i.checked = i.value === detail.duration; });

    // date
    dateInput.min = detail.minDate;
    dateInput.max = detail.maxDate;
    dateInput.value = detail.date;

    // start times
    startSelect.textContent = "";
    detail.startTimes.forEach(function (t) {
      startSelect.appendChild(el("option", { value: t, text: t }));
    });
    if (!detail.startTimes.length) startSelect.appendChild(el("option", { value: "", text: "No times left" }));
    startSelect.value = detail.start || "";
    startSelect.disabled = detail.duration === "day" || !detail.startTimes.length;

    // price
    var d = detail.durations.filter(function (x) { return x.id === detail.duration; })[0];
    amountEl.textContent = K.rwf(d.price);
    calcEl.textContent = detail.duration === "day"
      ? "FULL DAY 06:00 → 22:00 · BILLED AS 8H × " + K.num(detail.facility.rate) + " RWF"
      : d.label + " × " + K.num(detail.facility.rate) + " RWF/H";

    // vehicle types
    if (!vehicleSelect.options.length) {
      detail.vehicleTypes.forEach(function (v) {
        vehicleSelect.appendChild(el("option", { value: v, text: v.toUpperCase() }));
      });
    }
    vehicleSelect.value = state.vehicle || "";

    reserveBtn.disabled = submitting || !state.slot || !detail.start;
  }

  function notFound() {
    nameEl.textContent = "Facility not found";
    subEl.textContent = "";
    picker.replaceWith(el("p", { class: "empty" }, [
      "This facility doesn't exist or was removed. ",
      el("a", { class: "link", href: "browse.html", text: "Browse facilities" }),
    ]));
  }

  // ---- events -----------------------------------------------------------------

  gridEl.addEventListener("click", function (event) {
    var cell = event.target.closest(".cell");
    if (!cell || cell.disabled) return;
    var id = cell.getAttribute("data-slot");
    state.slot = state.slot === id ? null : id;
    errorEl.textContent = "";
    gridEl.querySelectorAll(".cell--available").forEach(function (c) {
      var on = c.getAttribute("data-slot") === state.slot;
      c.classList.toggle("cell--selected", on);
      c.setAttribute("aria-pressed", String(on));
      c.setAttribute("aria-label", c.getAttribute("data-slot") + ", " + (on ? "selected" : "available"));
    });
    renderPanel();
  });

  dateInput.addEventListener("change", function () {
    if (!dateInput.value) return;
    state.date = dateInput.value;
    errorEl.textContent = "";
    load();
  });

  vehicleSelect.addEventListener("change", function () {
    state.vehicle = vehicleSelect.value;
    K.setFieldError(vehicleSelect, "");
    errorEl.textContent = "";
    load();
  });

  plateInput.addEventListener("input", function () {
    K.setFieldError(plateInput, "");
  });

  startSelect.addEventListener("change", function () {
    state.start = startSelect.value;
    errorEl.textContent = "";
    load();
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!state.slot || !detail || submitting) return;

    var plate = K.cleanPlate(plateInput.value);
    if (!plate) {
      K.setFieldError(plateInput, "Enter the vehicle plate, e.g. RAD 482 C.");
      plateInput.focus();
      return;
    }
    plateInput.value = plate;

    submitting = true;
    errorEl.textContent = "";
    reserveBtn.disabled = true;
    reserveBtn.textContent = "Reserving…";

    K.api("/api/reservations", {
      method: "POST",
      body: {
        facilityId: state.id,
        level: state.level,
        slot: state.slot,
        date: state.date,
        start: state.start,
        duration: state.duration,
        plate: plate,
        vehicle: state.vehicle,
      },
    })
      .then(function (res) {
        window.location.assign("pay.html?serial=" + encodeURIComponent(res.reservation.serial));
      })
      .catch(function (err) {
        submitting = false;
        reserveBtn.textContent = "Reserve slot";
        var field = err.data && err.data.field;
        var target = field === "plate" ? plateInput : field === "vehicle" ? vehicleSelect : null;
        if (target) {
          K.setFieldError(target, err.message);
          target.focus();
        } else {
          errorEl.textContent = err.message;
        }
        if (err.status === 409) {
          state.slot = null;
          load();
        } else {
          renderPanel();
        }
      });
  });

  if (!state.id) {
    window.location.replace("browse.html");
  } else {
    // Prefill plate and vehicle from the account; both can be changed per booking.
    K.me().then(function (me) {
      if (!plateInput.value) plateInput.value = me.plate || "";
      if (!state.vehicle) state.vehicle = me.vehicle || "Car";
      load();
    }).catch(function () {
      state.vehicle = state.vehicle || "Car";
      load();
    });
  }
})();

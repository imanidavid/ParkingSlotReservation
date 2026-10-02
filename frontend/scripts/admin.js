// Admin console: facilities CRUD, parking-slot CRUD, all reservations,
// occupancy & revenue. One page; the hash picks the section
// (#facilities, #slots?facility=kcc&level=P1, #reservations, #revenue).
(function () {
  var K = window.Karita;
  var el = K.el;

  var meta = { facilityTypes: [], vehicleTypes: [] };
  var facilities = []; // last /api/admin/facilities

  // ---- small helpers ---------------------------------------------------------

  function sep() {
    return el("span", { class: "rstub__dot", "aria-hidden": "true", text: "·" });
  }

  function linkButton(label, onClick, cls) {
    var b = el("button", { type: "button", class: "linkbtn" + (cls ? " " + cls : ""), text: label });
    b.addEventListener("click", onClick);
    return b;
  }

  function actionsCell(nodes) {
    var td = el("td", { class: "admin__actions" });
    nodes.filter(Boolean).forEach(function (n, i) {
      if (i) td.appendChild(sep());
      td.appendChild(n);
    });
    return td;
  }

  function option(value, label, selected) {
    return el("option", { value: value, text: label, selected: selected || null });
  }

  function fillSelect(select, items, value, allLabel) {
    select.textContent = "";
    if (allLabel) select.appendChild(option("", allLabel));
    items.forEach(function (it) {
      select.appendChild(option(it.value, it.label, it.value === value));
    });
    select.value = value || "";
  }

  // Inline confirm in an actions cell: "Delete X? Yes, delete · Keep".
  function confirmIn(td, question, yesLabel, onYes, restore) {
    td.textContent = "";
    var yes = linkButton(yesLabel, function () {
      yes.disabled = true;
      yes.textContent = yesLabel + "…";
      onYes();
    }, "linkbtn--danger");
    td.appendChild(el("span", { class: "rstub__ask", text: question + " " }));
    td.appendChild(yes);
    td.appendChild(sep());
    td.appendChild(linkButton("Keep", restore));
    yes.focus();
  }

  // Inline form from field definitions. Errors show under each field.
  // defs: [{ name, label, type: "text"|"number"|"select", options:[{value,label}], mono, hint }]
  function buildForm(prefix, title, defs, values, submitLabel, onSubmit, onCancel) {
    var inputs = {};
    var grid = el("div", { class: "aform__grid" });
    defs.forEach(function (d) {
      var id = prefix + "-" + d.name;
      var input;
      if (d.type === "select") {
        input = el("select", { class: "input mono", id: id, name: d.name, "aria-describedby": id + "-error" });
        d.options.forEach(function (o) { input.appendChild(option(o.value, o.label)); });
        input.value = values[d.name] != null ? String(values[d.name]) : d.options[0].value;
      } else {
        input = el("input", {
          class: "input" + (d.mono ? " mono" : ""),
          id: id,
          name: d.name,
          type: d.type === "number" ? "number" : "text",
          inputmode: d.type === "number" ? "numeric" : null,
          value: values[d.name] != null ? String(values[d.name]) : "",
          placeholder: d.placeholder || null,
          autocomplete: "off",
          spellcheck: "false",
          "aria-describedby": id + "-error" + (d.hint ? " " + id + "-hint" : ""),
        });
      }
      input.addEventListener("input", function () { K.setFieldError(input, ""); });
      inputs[d.name] = input;
      grid.appendChild(el("div", { class: "aform__field" + (d.wide ? " aform__field--wide" : "") }, [
        el("label", { class: "aform__label", for: id, text: d.label }),
        d.type === "select"
          ? el("span", { class: "select" }, [input, el("span", { class: "select__caret", "aria-hidden": "true", text: "▾" })])
          : input,
        d.hint ? el("span", { class: "aform__hint", id: id + "-hint", text: d.hint }) : null,
        el("span", { class: "field__error", id: id + "-error" }),
      ]));
    });

    var error = el("p", { class: "aform__error", role: "alert" });
    var save = el("button", { class: "btn btn--primary", type: "submit", text: submitLabel });
    var cancel = el("button", { class: "btn btn--secondary", type: "button", text: "Cancel" });
    var form = el("form", { class: "aform", novalidate: true, "aria-label": title }, [
      el("p", { class: "aform__title", text: title }),
      grid,
      error,
      el("div", { class: "aform__buttons" }, [save, cancel]),
    ]);

    cancel.addEventListener("click", onCancel);
    form.addEventListener("keydown", function (e) {
      if (e.key === "Escape") onCancel();
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      error.textContent = "";
      var vals = {};
      Object.keys(inputs).forEach(function (k) { vals[k] = inputs[k].value.trim(); });
      save.disabled = true;
      onSubmit(vals, function done(err) {
        save.disabled = false;
        if (!err) return;
        var fields = (err.data && err.data.fields) || {};
        var first = null;
        Object.keys(fields).forEach(function (k) {
          if (!inputs[k]) return;
          K.setFieldError(inputs[k], fields[k]);
          first = first || inputs[k];
        });
        if (first) first.focus();
        else error.textContent = err.message;
      }, function setErrors(fields) {
        save.disabled = false;
        var first = null;
        Object.keys(fields).forEach(function (k) {
          K.setFieldError(inputs[k], fields[k]);
          first = first || inputs[k];
        });
        if (first) first.focus();
      });
    });

    setTimeout(function () {
      var first = form.querySelector("input, select");
      if (first) first.focus();
    }, 0);
    return form;
  }

  // ---- routing ---------------------------------------------------------------

  var panes = ["facilities", "slots", "reservations", "revenue"];

  function route() {
    var hash = window.location.hash.replace(/^#/, "");
    var name = hash.split("?")[0];
    if (panes.indexOf(name) === -1) name = "facilities";
    var params = new URLSearchParams(hash.split("?")[1] || "");
    panes.forEach(function (p) {
      document.getElementById(p).hidden = p !== name;
    });
    document.querySelectorAll(".appbar__nav a").forEach(function (a) {
      var on = a.getAttribute("href") === "admin.html#" + name;
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    document.title = name.charAt(0).toUpperCase() + name.slice(1) + " · Admin · Karita";
    ({ facilities: showFacilities, slots: showSlots, reservations: showReservations, revenue: showRevenue })[name](params);
  }

  function setHash(name, params) {
    var qs = params ? new URLSearchParams(params).toString() : "";
    var next = "#" + name + (qs ? "?" + qs : "");
    if (window.location.hash !== next) history.replaceState(null, "", next);
  }

  // ---- facilities ------------------------------------------------------------

  var facilityDefs = function () {
    return [
      { name: "name", label: "Name", wide: true },
      { name: "address", label: "Address", wide: true },
      { name: "city", label: "City" },
      { name: "type", label: "Type", type: "select", options: meta.facilityTypes.map(function (t) { return { value: t, label: t }; }) },
      { name: "rate", label: "Rate (RWF/hour)", type: "number", mono: true },
      { name: "levels", label: "Levels", mono: true, placeholder: "B1, B2", hint: "Comma-separated, e.g. G, P1" },
    ];
  };

  function loadFacilities() {
    return K.api("/api/admin/facilities").then(function (res) {
      meta.facilityTypes = res.facilityTypes;
      meta.vehicleTypes = res.vehicleTypes;
      facilities = res.facilities;
      return facilities;
    });
  }

  function showFacilities() {
    var errorEl = document.getElementById("facilities-error");
    errorEl.textContent = "";
    loadFacilities().then(renderFacilities).catch(function (err) {
      errorEl.textContent = err.message;
    });
  }

  function renderFacilities() {
    var body = document.getElementById("facilities-body");
    body.textContent = "";
    var active = facilities.filter(function (f) { return f.active; }).length;
    var slotsTotal = facilities.reduce(function (n, f) { return n + f.activeSlots; }, 0);
    document.getElementById("facilities-count").textContent = String(facilities.length).padStart(2, "0");
    document.getElementById("facilities-summary").textContent =
      facilities.length + " facilities · " + active + " active · " + K.num(slotsTotal) + " slots in service";

    facilities.forEach(function (f) {
      var row = el("tr", { "data-id": f.id });
      var td = actionsCell([]);
      function restore() {
        td.replaceWith((td = actionsCell(actions())));
      }
      function actions() {
        return [
          linkButton("Edit", function () { editFacility(row, f); }),
          el("a", { class: "link", href: "#slots?facility=" + encodeURIComponent(f.id), text: "Slots" }),
          linkButton(f.active ? "Deactivate" : "Activate", function () {
            patchFacility(f, { active: !f.active });
          }),
          linkButton("Delete", function () {
            confirmIn(td, "Delete " + f.name + "?", "Yes, delete", function () {
              K.api("/api/admin/facilities/" + encodeURIComponent(f.id), { method: "DELETE" })
                .then(showFacilities)
                .catch(function (err) {
                  document.getElementById("facilities-error").textContent = err.message;
                  restore();
                });
            }, restore);
          }),
        ];
      }
      [
        el("td", {}, [
          el("span", { class: "table__name", text: f.name }),
          el("span", { class: "table__type", text: f.type + (f.sampleTraffic ? " · sample traffic" : "") }),
        ]),
        el("td", { class: "table__muted wrap", text: f.address + ", " + f.city }),
        el("td", { class: "mono", text: f.levels.join(", ") }),
        el("td", { class: "num" }, [
          el("span", { text: K.num(f.activeSlots) }),
          f.activeSlots !== f.totalSlots ? el("span", { class: "avail__total", text: " / " + K.num(f.totalSlots) }) : null,
        ]),
        el("td", { class: "num", text: K.num(f.rate) }),
        el("td", {}, [K.statusPill(f.active ? "Active" : "Inactive")]),
      ].forEach(function (c) { row.appendChild(c); });
      td = actionsCell(actions());
      row.appendChild(td);
      body.appendChild(row);
    });
  }

  function patchFacility(f, changes) {
    var errorEl = document.getElementById("facilities-error");
    errorEl.textContent = "";
    return K.api("/api/admin/facilities/" + encodeURIComponent(f.id), { method: "PATCH", body: changes })
      .then(showFacilities)
      .catch(function (err) { errorEl.textContent = err.message; });
  }

  function closeEditors(tbody) {
    tbody.querySelectorAll(".row-editor").forEach(function (r) { r.remove(); });
  }

  function editFacility(row, f) {
    var tbody = row.parentNode;
    closeEditors(tbody);
    var editor = el("tr", { class: "row-editor" });
    var cell = el("td", { colspan: "7" });
    editor.appendChild(cell);
    var values = { name: f.name, address: f.address, city: f.city, type: f.type, rate: f.rate, levels: f.levels.join(", ") };
    cell.appendChild(buildForm("ef", "Edit " + f.name, facilityDefs(), values, "Save changes", function (vals, done, setErrors) {
      var errs = checkFacility(vals);
      if (Object.keys(errs).length) return setErrors(errs);
      K.api("/api/admin/facilities/" + encodeURIComponent(f.id), { method: "PATCH", body: vals })
        .then(function () { showFacilities(); })
        .catch(done);
    }, function () {
      editor.remove();
    }));
    row.after(editor);
  }

  // Client-side checks mirror the server's (server still validates).
  function checkFacility(v) {
    var e = {};
    if (v.name.length < 2) e.name = "2–80 characters.";
    if (v.address.length < 2) e.address = "2–120 characters.";
    if (v.city.length < 2) e.city = "2–60 characters.";
    var rate = Number(v.rate);
    if (!Number.isInteger(rate) || rate < 100 || rate > 20000) e.rate = "Whole RWF between 100 and 20,000.";
    var levels = v.levels.toUpperCase().split(/[\s,]+/).filter(Boolean);
    if (!levels.length || levels.some(function (l) { return !/^[A-Z0-9]{1,3}$/.test(l); })) e.levels = "e.g. B1, B2";
    return e;
  }

  document.getElementById("facility-new").addEventListener("click", function () {
    var mount = document.getElementById("facility-create");
    if (mount.firstChild) return mount.querySelector("input").focus();
    mount.appendChild(buildForm("nf", "New facility", facilityDefs(), { city: "Kigali", rate: 300, levels: "G" }, "Create facility", function (vals, done, setErrors) {
      var errs = checkFacility(vals);
      if (Object.keys(errs).length) return setErrors(errs);
      K.api("/api/admin/facilities", { method: "POST", body: vals })
        .then(function (res) {
          mount.textContent = "";
          window.location.hash = "#slots?facility=" + encodeURIComponent(res.facility.id);
        })
        .catch(done);
    }, function () {
      mount.textContent = "";
    }));
  });

  // ---- slots -----------------------------------------------------------------

  var slotState = { facility: "", level: "" };
  var slotFacilitySel = document.getElementById("slots-facility");
  var slotLevelSel = document.getElementById("slots-level");

  function currentFacility() {
    return facilities.filter(function (f) { return f.id === slotState.facility; })[0];
  }

  function showSlots(params) {
    var wanted = params.get("facility");
    var known = facilities.some(function (f) { return f.id === wanted; });
    // refresh the cache when asked for a facility it doesn't have (e.g. just created)
    var ready = facilities.length && (!wanted || known) ? Promise.resolve(facilities) : loadFacilities();
    ready.then(function () {
      slotState.facility = params.get("facility") || slotState.facility || (facilities[0] && facilities[0].id) || "";
      var f = currentFacility() || facilities[0];
      if (!f) return;
      slotState.facility = f.id;
      var lv = params.get("level");
      slotState.level = lv != null ? lv : f.levels.indexOf(slotState.level) !== -1 ? slotState.level : "";
      fillSelect(slotFacilitySel, facilities.map(function (x) {
        return { value: x.id, label: x.name + (x.active ? "" : " (inactive)") };
      }), f.id);
      fillSelect(slotLevelSel, f.levels.map(function (l) { return { value: l, label: l }; }), slotState.level, "All levels");
      setHash("slots", Object.assign({ facility: f.id }, slotState.level ? { level: slotState.level } : {}));
      loadSlots();
    }).catch(function (err) {
      document.getElementById("slots-error").textContent = err.message;
    });
  }

  function loadSlots() {
    var errorEl = document.getElementById("slots-error");
    errorEl.textContent = "";
    var q = new URLSearchParams({ facility: slotState.facility });
    if (slotState.level) q.set("level", slotState.level);
    return K.api("/api/admin/slots?" + q).then(function (res) {
      renderSlots(res.slots);
    }).catch(function (err) { errorEl.textContent = err.message; });
  }

  function renderSlots(list) {
    var body = document.getElementById("slots-body");
    body.textContent = "";
    var inService = list.filter(function (s) { return s.active; }).length;
    document.getElementById("slots-count").textContent = String(list.length).padStart(2, "0");
    document.getElementById("slots-summary").textContent =
      list.length + (list.length === 1 ? " slot" : " slots") + " · " + inService + " in service" +
      (list.length - inService ? " · " + (list.length - inService) + " out of service" : "");
    document.getElementById("slots-table").hidden = !list.length;
    document.getElementById("slots-empty").hidden = !!list.length;

    list.forEach(function (s) {
      var row = el("tr", { "data-slot": s.slotId });
      var td;
      function restore() {
        var fresh = actionsCell(actions());
        td.replaceWith(fresh);
        td = fresh;
      }
      function actions() {
        return [
          linkButton("Edit", function () { editSlot(row, s); }),
          linkButton(s.active ? "Deactivate" : "Activate", function () {
            patchSlot(s, { active: !s.active });
          }),
          linkButton("Delete", function () {
            confirmIn(td, "Delete " + s.level + " " + s.slotNumber + "?", "Yes, delete", function () {
              K.api("/api/admin/slots/" + s.slotId, { method: "DELETE" })
                .then(loadSlots)
                .catch(function (err) {
                  document.getElementById("slots-error").textContent = err.message;
                  restore();
                });
            }, restore);
          }),
        ];
      }
      [
        el("td", { class: "mono", text: s.level }),
        el("td", { class: "mono table__strong", text: s.slotNumber }),
        el("td", { text: s.vehicleType }),
        el("td", {}, [K.statusPill(s.active ? "Active" : "Inactive")]),
        el("td", {}, [s.active ? K.statusPill(s.status) : el("span", { class: "table__muted", text: "—" })]),
        el("td", { class: "num", text: String(s.upcoming) }),
      ].forEach(function (c) { row.appendChild(c); });
      td = actionsCell(actions());
      row.appendChild(td);
      body.appendChild(row);
    });
  }

  function patchSlot(s, changes) {
    var errorEl = document.getElementById("slots-error");
    errorEl.textContent = "";
    return K.api("/api/admin/slots/" + s.slotId, { method: "PATCH", body: changes })
      .then(loadSlots)
      .catch(function (err) { errorEl.textContent = err.message; });
  }

  function slotDefs(f) {
    return [
      { name: "level", label: "Level", type: "select", options: f.levels.map(function (l) { return { value: l, label: l }; }) },
      { name: "slotNumber", label: "Slot number", mono: true, placeholder: "A13", hint: "Row letter(s) + number" },
      { name: "vehicleType", label: "Vehicle type", type: "select", options: meta.vehicleTypes.map(function (v) { return { value: v, label: v }; }) },
    ];
  }

  function checkSlot(v) {
    var e = {};
    if (!/^[A-Z]{1,2}\d{1,3}$/.test(v.slotNumber.toUpperCase().replace(/\s+/g, ""))) e.slotNumber = "e.g. A13";
    return e;
  }

  function editSlot(row, s) {
    var tbody = row.parentNode;
    closeEditors(tbody);
    var f = currentFacility();
    var editor = el("tr", { class: "row-editor" });
    var cell = el("td", { colspan: "7" });
    editor.appendChild(cell);
    cell.appendChild(buildForm("es", "Edit " + s.level + " " + s.slotNumber, slotDefs(f), s, "Save changes", function (vals, done, setErrors) {
      var errs = checkSlot(vals);
      if (Object.keys(errs).length) return setErrors(errs);
      K.api("/api/admin/slots/" + s.slotId, { method: "PATCH", body: vals }).then(loadSlots).catch(done);
    }, function () {
      editor.remove();
    }));
    row.after(editor);
  }

  document.getElementById("slot-new").addEventListener("click", function () {
    var mount = document.getElementById("slot-create");
    var f = currentFacility();
    if (!f) return;
    mount.textContent = "";
    mount.appendChild(buildForm("ns", "New slot at " + f.name, slotDefs(f), { level: slotState.level || f.levels[0], vehicleType: "Car" }, "Create slot", function (vals, done, setErrors) {
      var errs = checkSlot(vals);
      if (Object.keys(errs).length) return setErrors(errs);
      vals.facilityId = f.id;
      K.api("/api/admin/slots", { method: "POST", body: vals })
        .then(function () {
          // keep the form open for adding the next slot
          var input = mount.querySelector("[name=slotNumber]");
          input.value = "";
          input.focus();
          mount.querySelector("button[type=submit]").disabled = false;
          loadSlots();
          loadFacilities();
        })
        .catch(done);
    }, function () {
      mount.textContent = "";
    }));
  });

  slotFacilitySel.addEventListener("change", function () {
    slotState.facility = slotFacilitySel.value;
    slotState.level = "";
    document.getElementById("slot-create").textContent = "";
    showSlots(new URLSearchParams({ facility: slotState.facility }));
  });

  slotLevelSel.addEventListener("change", function () {
    slotState.level = slotLevelSel.value;
    setHash("slots", Object.assign({ facility: slotState.facility }, slotState.level ? { level: slotState.level } : {}));
    loadSlots();
  });

  // ---- reservations ------------------------------------------------------------

  var resFacility = document.getElementById("res-facility");
  var resStatus = document.getElementById("res-status");
  var resDate = document.getElementById("res-date");

  function showReservations(params) {
    var ready = facilities.length ? Promise.resolve(facilities) : loadFacilities();
    ready.then(function () {
      fillSelect(resFacility, facilities.map(function (f) { return { value: f.id, label: f.name }; }), params.get("facility") || resFacility.value, "All facilities");
      if (params.has("status")) resStatus.value = params.get("status");
      if (params.has("date")) resDate.value = params.get("date");
      loadReservations();
    });
  }

  function loadReservations() {
    var errorEl = document.getElementById("reservations-error");
    errorEl.textContent = "";
    var q = {};
    if (resFacility.value) q.facility = resFacility.value;
    if (resStatus.value) q.status = resStatus.value;
    if (resDate.value) q.date = resDate.value;
    setHash("reservations", q);
    return K.api("/api/admin/reservations?" + new URLSearchParams(q)).then(function (res) {
      renderReservations(res.reservations, res.total);
    }).catch(function (err) { errorEl.textContent = err.message; });
  }

  function renderReservations(list, matching) {
    var body = document.getElementById("reservations-body");
    body.textContent = "";
    matching = matching == null ? list.length : matching;
    var total = list.reduce(function (n, r) { return n + (r.payment.status === "Paid" ? r.amount : 0); }, 0);
    document.getElementById("reservations-count").textContent = String(matching).padStart(2, "0");
    document.getElementById("reservations-summary").textContent = matching > list.length
      ? "Showing the latest " + K.num(list.length) + " of " + K.num(matching) + " reservations · filter by facility or date to narrow"
      : list.length + (list.length === 1 ? " reservation" : " reservations") + " · " + K.rwf(total) + " paid";
    document.getElementById("reservations-table").hidden = !list.length;
    document.getElementById("reservations-empty").hidden = !!list.length;

    list.forEach(function (r) {
      var s = r.start.split("T");
      var e = r.end.split("T");
      var td;
      var cancellable = r.status === "Confirmed" && r.state !== "Ended" && r.state !== "Left" && r.state !== "Parked";
      function restore() {
        var fresh = actionsCell(actions());
        td.replaceWith(fresh);
        td = fresh;
      }
      function actions() {
        return [cancellable ? linkButton("Cancel", function () {
          confirmIn(td, "Cancel № " + r.serial + "?", "Yes, cancel", function () {
            K.api("/api/admin/reservations/" + r.serial + "/cancel", { method: "POST" })
              .then(loadReservations)
              .catch(function (err) {
                document.getElementById("reservations-error").textContent = err.message;
                restore();
              });
          }, restore);
        }) : null];
      }
      var row = el("tr", {}, [
        el("td", { class: "mono table__muted", text: r.serial }),
        el("td", { class: "mono", text: r.date }),
        el("td", { class: "mono", text: s[1] + "→" + e[1] }),
        el("td", { class: "wrap" }, [r.facility + " ", el("span", { class: "stub__level", text: "· " + r.level + " " + r.slot })]),
        el("td", { class: "table__muted wrap", text: r.user }),
        el("td", { class: "mono", text: r.plate }),
        el("td", { class: "num", text: K.rwf(r.amount) }),
        el("td", {}, [K.statusPill(r.display)]),
      ]);
      td = actionsCell(actions());
      row.appendChild(td);
      body.appendChild(row);
    });
  }

  [resFacility, resStatus, resDate].forEach(function (c) {
    c.addEventListener("change", loadReservations);
  });
  document.getElementById("res-clear").addEventListener("click", function () {
    resFacility.value = "";
    resStatus.value = "";
    resDate.value = "";
    loadReservations();
  });

  // ---- revenue -----------------------------------------------------------------

  function showRevenue() {
    var errorEl = document.getElementById("revenue-error");
    errorEl.textContent = "";
    K.api("/api/admin/revenue").then(function (rep) {
      document.getElementById("revenue-asof").textContent = "As of " + rep.asOf;
      document.getElementById("revenue-summary").textContent =
        "Occupancy now · bookings and revenue " + rep.since + " → " + rep.until;
      var body = document.getElementById("revenue-body");
      body.textContent = "";
      var sample = rep.rows.some(function (r) { return r.sampleTraffic; });
      document.getElementById("revenue-note").textContent = (sample
        ? "* Occupancy includes sample traffic for demonstration. " : "") + "Revenue counts recorded payments only.";
      rep.rows.slice().sort(function (a, b) { return b.revenue - a.revenue || b.occupancy - a.occupancy; }).forEach(function (r) {
        body.appendChild(el("tr", {}, [
          el("td", { class: "wrap" }, [
            el("span", { class: "table__name", text: r.name + (r.sampleTraffic ? " *" : "") }),
            r.active ? null : el("span", { class: "table__type", text: "inactive" }),
          ]),
          el("td", { class: "num", text: K.num(r.slots) }),
          el("td", { class: "num", text: K.num(r.occupied) }),
          el("td", { class: "num", text: K.num(r.reserved) }),
          el("td", { class: "num" }, [
            el("span", { class: "meter", "aria-hidden": "true" }, [el("span", { class: "meter__fill", style: "width: " + r.occupancy + "%" })]),
            el("span", { text: r.occupancy + "%" }),
          ]),
          el("td", { class: "num", text: K.num(r.reservations) }),
          el("td", { class: "num table__strong", text: K.rwf(r.revenue) }),
          el("td", { class: "num table__muted", text: K.rwf(r.pending) }),
        ]));
      });
      var t = rep.total;
      var foot = document.getElementById("revenue-foot");
      foot.textContent = "";
      foot.appendChild(el("tr", {}, [
        el("th", { scope: "row", text: "All facilities" }),
        el("td", { class: "num", text: K.num(t.slots) }),
        el("td", { class: "num", text: K.num(t.occupied) }),
        el("td", { class: "num", text: K.num(t.reserved) }),
        el("td", { class: "num", text: t.occupancy + "%" }),
        el("td", { class: "num", text: K.num(t.reservations) }),
        el("td", { class: "num", text: K.rwf(t.revenue) }),
        el("td", { class: "num", text: K.rwf(t.pending) }),
      ]));
    }).catch(function (err) { errorEl.textContent = err.message; });
  }

  window.addEventListener("hashchange", route);
  route();
})();

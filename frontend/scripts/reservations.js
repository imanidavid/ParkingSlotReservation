// My reservations: upcoming stubs (pay / reschedule / cancel inline) + past table.
(function () {
  var K = window.Karita;
  var el = K.el;

  var main = document.getElementById("mine");
  var upcomingList = document.getElementById("upcoming-list");
  var upcomingEmpty = document.getElementById("upcoming-empty");
  var pastBody = document.getElementById("past-body");
  var pastTable = document.getElementById("past-table");
  var pastEmpty = document.getElementById("past-empty");
  var loadError = document.getElementById("load-error");

  var openSerial = null; // reservation whose reschedule panel is open
  var notes = {}; // serial -> note shown after an action

  function stamp(iso) {
    return iso.replace("T", " ");
  }

  function windowText(r) {
    var s = r.start.split("T");
    var e = r.end.split("T");
    return s[0] + " " + s[1] + " → " + (s[0] === e[0] ? e[1] : e[0] + " " + e[1]);
  }

  function linkButton(label, onClick, extra) {
    var b = el("button", { type: "button", class: "linkbtn" + (extra ? " " + extra : ""), text: label });
    b.addEventListener("click", onClick);
    return b;
  }

  function dotSep() {
    return el("span", { class: "rstub__dot", "aria-hidden": "true", text: "·" });
  }

  // ---- upcoming row ---------------------------------------------------------

  function renderRow(r) {
    var li = el("li", { class: "rstub", "data-serial": r.serial });
    var links = el("p", { class: "rstub__links" });
    var drawer = el("div", { class: "rstub__drawer", "data-open": "false", inert: true });

    function showLinks() {
      links.textContent = "";
      var items = [];
      if (r.can.pay) items.push(el("a", { class: "link", href: "pay.html?serial=" + encodeURIComponent(r.serial), text: "Pay" }));
      if (r.can.reschedule) {
        items.push(linkButton("Reschedule", function () { toggleDrawer(li, r, true); }, "js-reschedule"));
      }
      if (r.can.cancel) items.push(linkButton("Cancel", askCancel));
      items.forEach(function (node, i) {
        if (i) links.appendChild(dotSep());
        links.appendChild(node);
      });
    }

    function askCancel() {
      toggleDrawer(li, r, false);
      links.textContent = "";
      var yes = linkButton("Yes, cancel", function () {
        yes.disabled = true;
        yes.textContent = "Cancelling…";
        K.api("/api/reservations/" + r.serial + "/cancel", { method: "POST" })
          .then(load)
          .catch(function (err) {
            notes[r.serial] = { text: err.message, error: true };
            load();
          });
      }, "linkbtn--danger");
      links.appendChild(el("span", { class: "rstub__ask", text: "Cancel № " + r.serial + "?" }));
      links.appendChild(yes);
      links.appendChild(dotSep());
      var keep = linkButton("Keep it", showLinks);
      links.appendChild(keep);
      yes.focus();
    }

    showLinks();

    var note = notes[r.serial];
    li.appendChild(el("div", { class: "rstub__main" }, [
      el("a", { class: "rstub__slot", href: "ticket.html?serial=" + encodeURIComponent(r.serial), "aria-label": "Slot " + r.slot + ", open ticket № " + r.serial, text: r.slot }),
      el("div", { class: "rstub__info" }, [
        el("span", { class: "rstub__where", text: (r.facility + " · Level " + r.level).toUpperCase() }),
        el("span", { class: "rstub__window", text: windowText(r) }),
        el("span", { class: "rstub__plate", text: r.plate }),
      ]),
      el("div", { class: "rstub__side" }, [
        K.statusPill(r.display),
        links,
        note ? el("p", { class: "rstub__note" + (note.error ? " error-text" : ""), role: "status", text: note.text }) : null,
      ]),
    ]));
    li.appendChild(drawer);
    return li;
  }

  // ---- reschedule panel -----------------------------------------------------

  function buildPanel(li, r) {
    var ids = { start: "start-" + r.serial, end: "end-" + r.serial, status: "status-" + r.serial };

    function field(key, label, value, extra) {
      return el("div", { class: "resched__field" }, [
        el("label", { class: "resched__fieldlabel", for: ids[key], text: label }),
        el("input", Object.assign({
          class: "input mono",
          id: ids[key],
          name: key,
          value: value,
          autocomplete: "off",
          spellcheck: "false",
          "aria-describedby": ids[key] + "-error resched-help-" + r.serial,
        }, extra || {})),
        el("span", { class: "field__error", id: ids[key] + "-error" }),
      ]);
    }

    var formError = el("p", { class: "resched__error", role: "alert" });
    var save = el("button", { class: "btn btn--primary", type: "submit", text: "Save changes" });
    var cancel = el("button", { class: "btn btn--secondary", type: "button", text: "Cancel" });

    var form = el("form", { class: "resched", novalidate: true, "aria-label": "Reschedule № " + r.serial }, [
      el("p", { class: "resched__label", text: "Reschedule № " + r.serial }),
      el("div", { class: "resched__fields" }, [
        field("start", "Start", stamp(r.start)),
        field("end", "End", stamp(r.end)),
        el("div", { class: "resched__field" }, [
          el("label", { class: "resched__fieldlabel", for: ids.status, text: "Status" }),
          el("input", { class: "input mono input--locked", id: ids.status, value: r.status, readonly: true, "aria-readonly": "true", tabindex: "-1" }),
        ]),
      ]),
      el("p", { class: "resched__help", id: "resched-help-" + r.serial }, [
        "Format: yyyy-MM-dd HH:mm",
        r.payment.status === "Paid" ? " · Paid: keep the same length" : null,
      ]),
      formError,
      el("div", { class: "resched__buttons" }, [save, cancel]),
    ]);

    var startInput = form.querySelector("#" + ids.start);
    var endInput = form.querySelector("#" + ids.end);

    [startInput, endInput].forEach(function (input) {
      input.addEventListener("input", function () {
        K.setFieldError(input, "");
        formError.textContent = "";
      });
    });

    // Keep the length when the start moves on a paid reservation.
    if (r.payment.status === "Paid") {
      var lengthMin = (Date.parse(r.end) - Date.parse(r.start)) / 60000;
      startInput.addEventListener("change", function () {
        var m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(startInput.value.trim());
        if (!m) return;
        var d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5] + lengthMin);
        var p = function (n) { return String(n).padStart(2, "0"); };
        endInput.value = d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
      });
    }

    cancel.addEventListener("click", function () { toggleDrawer(li, r, false); });

    form.addEventListener("keydown", function (event) {
      if (event.key === "Escape") toggleDrawer(li, r, false);
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      K.setFieldError(startInput, "");
      K.setFieldError(endInput, "");
      formError.textContent = "";

      // Format check here; every other rule is the server's.
      var re = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
      var bad = null;
      if (!re.test(startInput.value.trim())) bad = startInput;
      else if (!re.test(endInput.value.trim())) bad = endInput;
      if (bad) {
        K.setFieldError(bad, "Use the format yyyy-MM-dd HH:mm.");
        bad.focus();
        return;
      }

      save.disabled = true;
      save.textContent = "Saving…";
      K.api("/api/reservations/" + r.serial, {
        method: "PATCH",
        body: { start: startInput.value.trim(), end: endInput.value.trim() },
      })
        .then(function (res) {
          var updated = res.reservation;
          var moved = "Rescheduled to " + windowText(updated) + ".";
          if (updated.amount !== r.amount) moved += " New amount " + K.rwf(updated.amount) + ".";
          notes[r.serial] = { text: moved };
          openSerial = null;
          return load();
        })
        .catch(function (err) {
          save.disabled = false;
          save.textContent = "Save changes";
          var target = err.data && err.data.field === "end" ? endInput : err.data && err.data.field === "start" ? startInput : null;
          if (target) {
            K.setFieldError(target, err.message);
            target.focus();
          } else {
            formError.textContent = err.message;
          }
        });
    });

    return form;
  }

  function toggleDrawer(li, r, open) {
    // one panel at a time
    if (open && openSerial && openSerial !== r.serial) {
      var other = upcomingList.querySelector('[data-serial="' + openSerial + '"]');
      if (other) closeDrawer(other);
    }
    var drawer = li.querySelector(".rstub__drawer");
    if (open) {
      if (!drawer.firstChild) drawer.appendChild(el("div", { class: "rstub__drawer-inner" }, [buildPanel(li, r)]));
      drawer.removeAttribute("inert");
      drawer.setAttribute("data-open", "true");
      openSerial = r.serial;
      var first = drawer.querySelector("input");
      setTimeout(function () { first.focus(); first.select(); }, 0);
    } else {
      closeDrawer(li);
      var trigger = li.querySelector(".js-reschedule");
      if (trigger) trigger.focus();
    }
  }

  function closeDrawer(li) {
    var drawer = li.querySelector(".rstub__drawer");
    drawer.setAttribute("data-open", "false");
    drawer.setAttribute("inert", "");
    if (openSerial === li.getAttribute("data-serial")) openSerial = null;
    // drop the form after the slide so it reopens with fresh values
    setTimeout(function () {
      if (drawer.getAttribute("data-open") === "false") drawer.textContent = "";
    }, 220);
  }

  // ---- past table -----------------------------------------------------------

  function renderPast(items) {
    pastBody.textContent = "";
    items.forEach(function (r) {
      var href = "ticket.html?serial=" + encodeURIComponent(r.serial);
      var row = el("tr", {}, [
        el("td", { class: "mono" }, [el("time", { datetime: r.date, text: r.date })]),
        el("td", {}, [el("a", { class: "table__name table__slot", href: href, "aria-label": "Slot " + r.slot + ", ticket № " + r.serial, text: r.slot })]),
        el("td", {}, [r.facility + " ", el("span", { class: "stub__level", text: "· " + r.level })]),
        el("td", { class: "num", text: K.rwf(r.amount) }),
        el("td", { class: "col-status" }, [K.statusPill(r.display)]),
      ]);
      row.addEventListener("click", function (event) {
        if (!event.target.closest("a")) window.location.assign(href);
      });
      pastBody.appendChild(row);
    });
    pastTable.hidden = !items.length;
    pastEmpty.hidden = !!items.length;
    document.getElementById("past-count").textContent = items.length ? String(items.length).padStart(2, "0") : "";
  }

  // ---- load -----------------------------------------------------------------

  function load() {
    return K.api("/api/reservations")
      .then(function (data) {
        upcomingList.textContent = "";
        data.upcoming.forEach(function (r) {
          upcomingList.appendChild(renderRow(r));
        });
        upcomingList.hidden = !data.upcoming.length;
        upcomingEmpty.hidden = !!data.upcoming.length;
        document.getElementById("upcoming-count").textContent = data.upcoming.length ? String(data.upcoming.length).padStart(2, "0") : "";
        renderPast(data.past);
        notes = {};
      })
      .catch(function (err) {
        loadError.textContent = err.message;
        loadError.hidden = false;
      })
      .then(function () {
        main.removeAttribute("aria-busy");
      });
  }

  load();
})();

// Attendant desk: verify a plate (or slot) and check the car in; live board
// of every slot at the attendant's facility.
(function () {
  var K = window.Karita;
  var el = K.el;
  var REFRESH_MS = 30000;

  var form = document.getElementById("lookup");
  var input = document.getElementById("lookup-input");
  var label = document.getElementById("lookup-label");
  var modeBtn = document.getElementById("lookup-mode");
  var verifyBtn = document.getElementById("lookup-btn");
  var result = document.getElementById("result");
  var boardEl = document.getElementById("board-levels");

  var mode = "plate"; // or "slot"
  var focusSlot = null; // { level, slot } highlighted on the board

  // ---- lookup mode --------------------------------------------------------

  function setMode(next) {
    mode = next;
    label.textContent = mode === "plate" ? "Plate number" : "Slot number";
    input.name = mode;
    input.placeholder = mode === "plate" ? "RAD 482 C" : "B1 A1";
    modeBtn.textContent = mode === "plate" ? "Search by slot number instead" : "Search by plate instead";
    input.value = "";
    K.setFieldError(input, "");
    result.textContent = "";
    input.focus();
  }

  modeBtn.addEventListener("click", function () {
    setMode(mode === "plate" ? "slot" : "plate");
  });

  input.addEventListener("input", function () {
    K.setFieldError(input, "");
  });

  // ---- result panels ------------------------------------------------------

  function fmtMinutes(min) {
    var h = Math.floor(min / 60);
    var m = min % 60;
    return (h ? h + " h " : "") + (m ? m + " min" : "").trim();
  }

  function timeOf(iso) {
    return new Date(iso).toTimeString().slice(0, 5);
  }

  function renderMatch(r) {
    var paid = r.payment.status === "Paid";
    var s = r.start.split("T");
    var e = r.end.split("T");

    var spec = el("dl", { class: "vticket__spec" });
    [
      ["Facility", (r.facility + " · Level " + r.level).toUpperCase()],
      ["Window", s[0] + " " + s[1] + " → " + e[1]],
      ["Plate", r.plate],
      ["Vehicle", (r.vehicle || "—").toUpperCase()],
      ["Amount", K.rwf(r.amount)],
      ["Method", (r.payment.method || "—").toUpperCase()],
    ].forEach(function (row) {
      spec.appendChild(el("dt", { text: row[0] }));
      spec.appendChild(el("dd", { text: row[1] }));
    });

    var actions = el("div", { class: "vticket__actions" });
    var note = el("p", { class: "vticket__note", role: "status" });

    if (r.releasedAt) {
      note.textContent = "Car left at " + timeOf(r.releasedAt) + ". The slot is free again.";
    } else if (r.checkedInAt) {
      note.textContent = "Marked occupied at " + timeOf(r.checkedInAt) + ".";
      var release = el("button", { class: "btn btn--secondary", type: "button", text: "Release slot" });
      release.addEventListener("click", function () {
        act(r, "release", release, "Releasing…");
      });
      actions.appendChild(release);
    } else {
      if (r.startsIn > 0) note.textContent = "Starts at " + s[1] + " (in " + fmtMinutes(r.startsIn) + "). Early arrival is fine.";
      var occupy = el("button", { class: "btn btn--primary", type: "button", text: "Mark as occupied", disabled: !paid });
      occupy.addEventListener("click", function () {
        act(r, "occupy", occupy, "Marking…");
      });
      actions.appendChild(occupy);

      if (!paid) {
        note.textContent = "Not paid. Collect " + K.rwf(r.amount) + " before entry.";
        var cash = el("button", { class: "linkbtn", type: "button", text: "Record cash payment" });
        cash.addEventListener("click", function () {
          act(r, "cash", cash, "Recording…");
        });
        actions.appendChild(cash);
      }
    }

    var stamp = r.releasedAt ? "Left" : r.checkedInAt ? "Occupied" : paid ? "Paid" : "Unpaid";

    var panel = el("article", { class: "vticket", "aria-label": "Reservation № " + r.serial }, [
      el("div", { class: "vticket__stub" }, [
        el("span", { class: "vticket__serial", text: "№ " + r.serial }),
      ]),
      el("div", { class: "vticket__body" }, [
        el("div", { class: "vticket__head" }, [
          el("span", { class: "vticket__label", text: "Slot" }),
          el("p", { class: "vticket__slot", text: r.slot }),
        ]),
        spec,
        note.textContent ? note : null,
        actions.childNodes.length ? actions : null,
      ]),
      el("span", { class: "vticket__stamp vticket__stamp--" + stamp.toLowerCase(), "aria-hidden": "true", text: stamp }),
    ]);

    result.textContent = "";
    result.appendChild(panel);
  }

  function renderMiss(message) {
    var other = el("button", {
      class: "linkbtn",
      type: "button",
      text: mode === "plate" ? "Search by slot number instead" : "Search by plate instead",
    });
    other.addEventListener("click", function () {
      setMode(mode === "plate" ? "slot" : "plate");
    });
    result.textContent = "";
    result.appendChild(el("div", { class: "miss" }, [
      el("p", { class: "miss__text", text: message }),
      other,
    ]));
  }

  function act(r, kind, button, busyLabel) {
    button.disabled = true;
    button.textContent = busyLabel;
    K.api("/api/attendant/reservations/" + r.serial + "/" + kind, { method: "POST" })
      .then(function (res) {
        renderMatch(res.reservation);
        refresh();
      })
      .catch(function (err) {
        result.appendChild(el("p", { class: "result__error", role: "alert", text: err.message }));
        button.disabled = false;
      });
  }

  // ---- verify -------------------------------------------------------------

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var value = input.value.trim();
    if (!value) {
      K.setFieldError(input, mode === "plate" ? "Enter a plate number." : "Enter a slot, e.g. B1 A1.");
      input.focus();
      return;
    }

    verifyBtn.disabled = true;
    verifyBtn.textContent = "Verifying…";
    var q = new URLSearchParams();
    q.set(mode, value);

    K.api("/api/attendant/verify?" + q)
      .then(function (res) {
        focusSlot = { level: res.reservation.level, slot: res.reservation.slot };
        renderMatch(res.reservation);
        highlightBoard();
      })
      .catch(function (err) {
        focusSlot = null;
        highlightBoard();
        if (err.status === 404) renderMiss(err.message);
        else K.setFieldError(input, err.message);
      })
      .then(function () {
        verifyBtn.disabled = false;
        verifyBtn.textContent = "Verify";
      });
  });

  // ---- today at this facility -----------------------------------------------

  var todayBody = document.getElementById("today-body");
  var todayEmpty = document.getElementById("today-empty");
  var todayTable = document.getElementById("today-table");

  function rowAction(r, kind, label, cls) {
    var b = el("button", { type: "button", class: cls || "linkbtn", text: label });
    b.addEventListener("click", function () {
      b.disabled = true;
      b.textContent = label + "…";
      K.api("/api/attendant/reservations/" + r.serial + "/" + kind, { method: "POST" })
        .then(function (res) {
          // keep the verify panel in step if it shows this reservation
          if (result.querySelector('[aria-label="Reservation \u2116 ' + r.serial + '"]')) renderMatch(res.reservation);
          refresh();
        })
        .catch(function (err) {
          b.disabled = false;
          b.textContent = label;
          todayEmpty.hidden = false;
          todayEmpty.textContent = err.message;
          todayEmpty.classList.add("error-text");
        });
    });
    return b;
  }

  function renderToday(list) {
    todayBody.textContent = "";
    todayTable.hidden = !list.length;
    todayEmpty.hidden = !!list.length;
    todayEmpty.classList.remove("error-text");
    todayEmpty.textContent = "No reservations today at this facility.";
    document.getElementById("today-count").textContent = list.length ? String(list.length).padStart(2, "0") : "";

    list.forEach(function (r) {
      var paid = r.payment.status === "Paid";
      var actions = el("td", { class: "today__actions" });
      var add = function (node) {
        if (actions.childNodes.length) actions.appendChild(el("span", { class: "rstub__dot", "aria-hidden": "true", text: "\u00b7" }));
        actions.appendChild(node);
      };
      if (r.state === "Due" || r.state === "Late") {
        if (!paid) add(rowAction(r, "cash", "Record cash"));
        else add(rowAction(r, "occupy", "Mark occupied"));
        if (r.canNoShow) add(rowAction(r, "no-show", "No-show", "linkbtn linkbtn--danger"));
      }
      if (r.state === "Parked") add(rowAction(r, "release", "Release"));

      todayBody.appendChild(el("tr", { "data-serial": r.serial }, [
        el("td", { class: "mono", text: r.start.split("T")[1] + "\u2192" + r.end.split("T")[1] }),
        el("td", { class: "mono", text: r.level + " " + r.slot }),
        el("td", { class: "mono", text: r.plate }),
        el("td", {}, [K.statusPill(paid ? "Paid" : "Unpaid")]),
        el("td", { class: "today__state today__state--" + r.state.toLowerCase().replace(/[^a-z]+/g, "-"), text: r.state }),
        actions,
      ]));
    });
  }

  function loadToday() {
    return K.api("/api/attendant/today").then(function (res) {
      renderToday(res.reservations);
    }).catch(function (err) {
      todayEmpty.hidden = false;
      todayEmpty.textContent = err.message;
    });
  }

  function refresh() {
    loadBoard();
    loadToday();
  }

  // ---- live board ---------------------------------------------------------

  function renderBoard(b) {
    document.getElementById("board-facility").textContent = "· " + b.facility.name;
    document.getElementById("board-asof").textContent = "As of " + b.asOf;
    document.getElementById("board-counts").textContent =
      "AVAILABLE " + b.counts.Available + " · RESERVED " + b.counts.Reserved + " · OCCUPIED " + b.counts.Occupied +
      (b.counts.Inactive ? " · OUT OF SERVICE " + b.counts.Inactive : "");
    document.getElementById("board-sample").hidden = !b.sampleTraffic;

    // Update cells in place so status changes can transition.
    b.levels.forEach(function (level) {
      var block = boardEl.querySelector('[data-level="' + level.name + '"]');
      if (!block) {
        block = el("div", { class: "board__level", "data-level": level.name }, [
          el("p", { class: "board__levelname", text: "Level " + level.name }),
          el("div", { class: "board__grid", role: "list" }),
        ]);
        boardEl.appendChild(block);
      }
      var grid = block.querySelector(".board__grid");
      grid.style.setProperty("--cols", level.cols);
      var seen = {};

      level.rows.forEach(function (row, r) {
        row.slots.forEach(function (s) {
          seen[s.id] = true;
          var cell = grid.querySelector('[data-slot="' + s.id + '"]');
          if (!cell) {
            cell = el("span", { class: "bcell", role: "listitem", "data-slot": s.id, text: s.id });
            grid.appendChild(cell);
          }
          // place by row and slot number so gaps stay visible
          cell.style.gridRow = String(r + 1);
          cell.style.gridColumn = String(s.col || "auto");
          cell.className = "bcell bcell--" + s.status.toLowerCase();
          var label = s.status === "Inactive" ? "out of service" : s.status.toLowerCase();
          cell.setAttribute("aria-label", level.name + " " + s.id + ", " + label);
        });
      });
      // slots an admin removed since the last refresh
      grid.querySelectorAll(".bcell").forEach(function (c) {
        if (!seen[c.getAttribute("data-slot")]) c.remove();
      });
    });
    boardEl.querySelectorAll(".board__level").forEach(function (block) {
      var still = b.levels.some(function (l) { return l.name === block.getAttribute("data-level"); });
      if (!still) block.remove();
    });
    highlightBoard();
  }

  function highlightBoard() {
    boardEl.querySelectorAll(".bcell--focus").forEach(function (c) {
      c.classList.remove("bcell--focus");
    });
    if (!focusSlot) return;
    var cell = boardEl.querySelector('[data-level="' + focusSlot.level + '"] [data-slot="' + focusSlot.slot + '"]');
    if (cell) cell.classList.add("bcell--focus");
  }

  function loadBoard() {
    return K.api("/api/attendant/board").then(renderBoard).catch(function (err) {
      document.getElementById("board-counts").textContent = err.message;
    });
  }

  refresh();
  setInterval(function () {
    if (!document.hidden) refresh();
  }, REFRESH_MS);
})();

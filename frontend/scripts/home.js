// Driver home: upcoming ticket, a short facilities table and past stubs.
(function () {
  var K = window.Karita;
  var el = K.el;

  function renderUpcoming(upcoming) {
    var mount = document.getElementById("upcoming-ticket");
    var actions = document.getElementById("upcoming-actions");
    mount.textContent = "";
    if (!upcoming) {
      mount.appendChild(el("p", { class: "empty" }, [
        "No upcoming reservation. ",
        el("a", { class: "link", href: "browse.html", text: "Browse facilities" }),
      ]));
      actions.hidden = true;
      return;
    }
    mount.appendChild(K.renderTicket(upcoming));
    document.getElementById("show-at-entry").href = "ticket.html?serial=" + encodeURIComponent(upcoming.serial);
    actions.hidden = false;
  }

  function renderFacilities(list, count) {
    var body = document.getElementById("facilities-body");
    document.getElementById("facilities-count").textContent = String(count).padStart(2, "0");
    body.textContent = "";

    list.forEach(function (f) {
      var href = "facility.html?id=" + encodeURIComponent(f.id);
      var row = el("tr", {}, [
        el("td", {}, [el("a", { class: "table__name", href: href, text: f.name })]),
        el("td", { class: "table__muted col-location", text: f.address + ", " + f.city }),
        el("td", { class: "num" }, [
          el("span", { class: "avail" + (f.available === 0 ? " avail--none" : ""), text: String(f.available) }),
          el("span", { class: "avail__total", text: " / " + f.totalSlots }),
        ]),
        el("td", { class: "num", text: K.num(f.rateFrom) + " RWF/H" }),
      ]);
      row.addEventListener("click", function (event) {
        if (!event.target.closest("a")) window.location.assign(href);
      });
      body.appendChild(row);
    });
  }

  function renderPast(items) {
    var list = document.getElementById("past-list");
    list.textContent = "";
    if (!items.length) {
      list.appendChild(el("li", { class: "empty stubs__empty", text: "No past reservations yet." }));
      return;
    }
    items.forEach(function (r) {
      list.appendChild(
        el("li", { class: "stub" }, [
          el("time", { class: "stub__date", datetime: r.date, text: r.date }),
          el("span", { class: "stub__slot", text: r.slot }),
          el("span", { class: "stub__facility" }, [
            r.facility + " ",
            el("span", { class: "stub__level", text: "· " + r.level }),
          ]),
          el("span", { class: "stub__amount", text: K.rwf(r.amount) }),
          el("span", { class: "stub__status" }, [K.statusPill(r.display)]),
        ])
      );
    });
  }

  K.api("/api/home")
    .then(function (data) {
      renderUpcoming(data.upcoming);
      renderFacilities(data.facilities, data.facilityCount);
      renderPast(data.past);
    })
    .catch(function (err) {
      document.getElementById("upcoming-ticket").appendChild(
        el("p", { class: "empty error-text", text: err.message })
      );
    });
})();

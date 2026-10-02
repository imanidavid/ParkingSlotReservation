// The Ticket (?serial=00412): printed-stub view + "Save ticket" as PNG.
(function () {
  var K = window.Karita;
  var serial = K.param("serial");
  var page = document.getElementById("slip-page");
  var errorEl = document.getElementById("t-error");
  var saveBtn = document.getElementById("save-ticket");
  var ticket = null;

  // 8×8 block seeded from the serial. Decorative — not a scannable code.
  function qrCells(seedText) {
    var h = 2166136261;
    for (var i = 0; i < seedText.length; i++) {
      h ^= seedText.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    var cells = [];
    for (var y = 0; y < 8; y++) {
      for (var x = 0; x < 8; x++) {
        h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
        var corner = (x < 2 && y < 2) || (x > 5 && y < 2) || (x < 2 && y > 5);
        if (corner || (h >>> 0) % 2) cells.push([x, y]);
      }
    }
    return cells;
  }

  function fields(r) {
    var s = r.start.split("T");
    var e = r.end.split("T");
    var paid = r.payment.status === "Paid";
    return {
      serial: "№ " + r.serial,
      slot: r.slot,
      where: (r.facility + " · Level " + r.level).toUpperCase(),
      rows: [
        ["Date", s[0]],
        ["Window", s[1] + " → " + (s[0] === e[0] ? e[1] : e[0] + " " + e[1])],
        ["Duration", r.duration],
        ["Vehicle", (r.vehicle || "—").toUpperCase()],
        ["Plate", r.plate],
        ["Amount", K.rwf(r.amount)],
        ["Method", (r.payment.method || "—").toUpperCase()],
      ],
      stamp: r.status === "Cancelled" ? "Void" : paid ? "Paid" : "Confirmed",
      stampMuted: r.status === "Cancelled" || !paid,
    };
  }

  function render(r) {
    var f = fields(r);
    document.title = "Ticket " + f.serial + " · Karita";
    document.getElementById("t-serial").textContent = f.serial;
    document.getElementById("t-slot").textContent = f.slot;
    document.getElementById("t-where").textContent = f.where;
    var ids = ["t-date", "t-window", "t-duration", "t-vehicle", "t-plate", "t-amount", "t-method"];
    f.rows.forEach(function (row, i) {
      document.getElementById(ids[i]).textContent = row[1];
    });

    var qr = document.getElementById("t-qr");
    qr.setAttribute("aria-label", "Entry code for ticket " + f.serial);
    qr.textContent = "";
    qrCells(r.serial).forEach(function (c) {
      var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", c[0] + 0.08);
      rect.setAttribute("y", c[1] + 0.08);
      rect.setAttribute("width", 0.84);
      rect.setAttribute("height", 0.84);
      qr.appendChild(rect);
    });

    var stamp = document.getElementById("t-stamp");
    stamp.textContent = f.stamp;
    stamp.classList.toggle("slip__stamp--pending", f.stampMuted);
    stamp.hidden = false;

    var small = document.getElementById("t-small");
    if (r.payment.paidAt) {
      var at = new Date(r.payment.paidAt);
      var p2 = function (n) { return String(n).padStart(2, "0"); };
      small.textContent = "Paid " + at.getFullYear() + "-" + p2(at.getMonth() + 1) + "-" + p2(at.getDate()) + " " +
        p2(at.getHours()) + ":" + p2(at.getMinutes()) + ". Show this ticket at entry. The attendant will verify your plate; the pattern is decorative.";
    }
    if (r.status === "Cancelled") small.textContent = "This reservation was cancelled. The ticket is no longer valid.";
    else if (r.payment.method === "Cash" && r.payment.status !== "Paid") {
      small.textContent = "Pay " + K.rwf(r.amount) + " in cash at entry. The attendant will verify your plate.";
    }
  }

  // ---- Save ticket: redraw the stub on a canvas, always on light paper ----

  var PAPER = { bg: "#F4F1EA", surface: "#FFFFFF", ink: "#1A1A1A", muted: "#6B6558", rule: "#D8D2C4", stamp: "#B22B1F" };
  var DISPLAY = '"Fraunces", Georgia, serif';
  var MONO = '"IBM Plex Mono", ui-monospace, monospace';

  function drawTicket(r) {
    var f = fields(r);
    var W = 480;
    var padL = 28;
    var padR = 32;
    var rowH = 26;
    var y0 = 0;
    var topH = 46;
    var heroH = 168;
    var specH = 28 + f.rows.length * rowH;
    var bottomH = 116;
    var H = topH + heroH + specH + bottomH;
    var scale = 2;
    var margin = 24;

    var canvas = document.createElement("canvas");
    canvas.width = (W + margin * 2) * scale;
    canvas.height = (H + margin * 2) * scale;
    var ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);

    // paper background around the stub
    ctx.fillStyle = PAPER.bg;
    ctx.fillRect(0, 0, W + margin * 2, H + margin * 2);
    ctx.translate(margin, margin);

    ctx.fillStyle = PAPER.surface;
    ctx.fillRect(0, 0, W, H);

    // grain
    for (var n = 0; n < 2600; n++) {
      ctx.fillStyle = "rgba(26,26,26," + (Math.random() * 0.05).toFixed(3) + ")";
      ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1);
    }

    function hline(y) {
      ctx.strokeStyle = PAPER.rule;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
      ctx.stroke();
    }

    function text(str, x, y, font, color, align, spacing) {
      ctx.font = font;
      ctx.fillStyle = color;
      ctx.textAlign = align || "left";
      ctx.textBaseline = "alphabetic";
      if ("letterSpacing" in ctx) ctx.letterSpacing = spacing || "0px";
      ctx.fillText(str, x, y);
    }

    // frame: top/bottom rules, perforated left, scalloped right
    hline(0);
    hline(H - 1);
    ctx.strokeStyle = PAPER.muted;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0.5, 0);
    ctx.lineTo(0.5, H);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = PAPER.rule;
    for (var sy = 0; sy < H; sy += 18) {
      ctx.fillStyle = PAPER.bg;
      ctx.beginPath();
      ctx.arc(W, sy + 9, 4, Math.PI / 2, Math.PI * 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(W - 0.5, sy);
      ctx.lineTo(W - 0.5, sy + 5);
      ctx.arc(W - 0.5, sy + 9, 4, -Math.PI / 2, Math.PI / 2, true);
      ctx.lineTo(W - 0.5, sy + 18);
      ctx.stroke();
    }

    // top row
    text("KARITA", padL, y0 + 29, "600 14px " + DISPLAY, PAPER.ink, "left", "4px");
    text(f.serial, W - padR, y0 + 29, "12px " + MONO, PAPER.muted, "right", "0.7px");
    hline(topH);

    // slot
    text(f.slot, W / 2, topH + 110, "500 96px " + DISPLAY, PAPER.ink, "center");
    text(f.where, W / 2, topH + 142, "12px " + MONO, PAPER.muted, "center", "1.2px");
    hline(topH + heroH);

    // spec list
    var y = topH + heroH + 14;
    f.rows.forEach(function (row) {
      y += rowH;
      text(row[0].toUpperCase(), padL, y - 8, "14px " + MONO, PAPER.muted, "left", "1px");
      text(row[1], W - padR, y - 8, "14px " + MONO, PAPER.ink, "right");
    });
    hline(topH + heroH + specH);

    // QR block
    var by = topH + heroH + specH + 26;
    ctx.fillStyle = PAPER.ink;
    qrCells(r.serial).forEach(function (c) {
      ctx.fillRect(padL + c[0] * 8 + 0.6, by + c[1] * 8 + 0.6, 6.8, 6.8);
    });

    // stamp
    ctx.save();
    ctx.globalAlpha = 0.78;
    var color = f.stampMuted ? PAPER.muted : PAPER.stamp;
    var size = f.stampMuted ? 20 : 28;
    ctx.font = "600 " + size + "px " + DISPLAY;
    if ("letterSpacing" in ctx) ctx.letterSpacing = size * 0.24 + "px";
    var label = f.stamp.toUpperCase();
    var tw = ctx.measureText(label).width;
    var bw = tw + 32;
    var bh = size + 14;
    ctx.translate(W - 48 - bw / 2, by + 32);
    ctx.rotate((-8 * Math.PI) / 180);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, size * 0.12, 1);
    ctx.restore();

    return canvas;
  }

  function saveTicket() {
    saveBtn.disabled = true;
    errorEl.textContent = "";
    var loads = ["600 14px Fraunces", "500 96px Fraunces", "14px 'IBM Plex Mono'"].map(function (font) {
      return document.fonts ? document.fonts.load(font) : Promise.resolve();
    });
    Promise.all(loads)
      .catch(function () {})
      .then(function () {
        drawTicket(ticket).toBlob(function (blob) {
          saveBtn.disabled = false;
          if (!blob) {
            errorEl.textContent = "Couldn't create the image. Try printing the page instead.";
            return;
          }
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a");
          a.href = url;
          a.download = "karita-ticket-" + ticket.serial + ".png";
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        }, "image/png");
      });
  }

  saveBtn.addEventListener("click", saveTicket);

  if (!/^\d{5}$/.test(serial)) {
    window.location.replace("reservations.html");
    return;
  }

  K.api("/api/reservations/" + encodeURIComponent(serial))
    .then(function (res) {
      ticket = res.reservation;
      render(ticket);
      saveBtn.disabled = false;
    })
    .catch(function (err) {
      errorEl.textContent = err.status === 404 ? "Ticket not found." : err.message;
      document.getElementById("slip").hidden = true;
    })
    .then(function () {
      page.removeAttribute("aria-busy");
    });

  // exposed for verification
  window.KaritaTicket = { draw: function () { return ticket && drawTicket(ticket); } };
})();

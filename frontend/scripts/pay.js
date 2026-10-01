// Payment form for one reservation (?serial=00412).
(function () {
  var K = window.Karita;
  var el = K.el;
  var serial = K.param("serial");

  var main = document.getElementById("pay");
  var form = document.getElementById("pay-form");
  var payBtn = document.getElementById("pay-btn");
  var payError = document.getElementById("pay-error");
  var momoFields = document.getElementById("momo-fields");
  var cardFields = document.getElementById("card-fields");
  var cashHint = document.getElementById("cash-hint");

  var inputs = {
    phone: document.getElementById("phone"),
    cardNumber: document.getElementById("cardNumber"),
    expiry: document.getElementById("expiry"),
    cvc: document.getElementById("cvc"),
    reference: document.getElementById("reference"),
  };

  function method() {
    var checked = form.querySelector("input[name=method]:checked");
    return checked ? checked.value : "";
  }

  function clearErrors() {
    payError.textContent = "";
    Object.keys(inputs).forEach(function (k) { K.setFieldError(inputs[k], ""); });
  }

  function syncMethod() {
    var m = method();
    momoFields.hidden = m !== "Mobile Money";
    cardFields.hidden = m !== "Card";
    cashHint.hidden = m !== "Cash";
    clearErrors();
  }

  // ---- summary ---------------------------------------------------------------

  function render(r) {
    var s = r.start.split("T");
    var e = r.end.split("T");
    document.getElementById("mini-serial").textContent = "№ " + r.serial;
    document.getElementById("mini-slot").textContent = r.slot;
    document.getElementById("mini-facility").textContent = (r.facility + " · " + r.level).toUpperCase();
    document.getElementById("mini-window").textContent = s[0] + " " + s[1] + " → " + (s[0] === e[0] ? e[1] : e[0] + " " + e[1]);
    document.getElementById("mini-plate").textContent = r.plate;
    document.getElementById("amount-due").textContent = K.rwf(r.amount);
  }

  function blocked(message) {
    form.replaceWith(el("p", { class: "empty" }, [
      message + " ",
      el("a", { class: "link", href: "reservations.html", text: "View your reservations" }),
    ]));
  }

  // ---- input formatting ------------------------------------------------------

  inputs.cardNumber.addEventListener("input", function () {
    var digits = inputs.cardNumber.value.replace(/\D/g, "").slice(0, 19);
    inputs.cardNumber.value = digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  });

  inputs.expiry.addEventListener("input", function (event) {
    var digits = inputs.expiry.value.replace(/\D/g, "").slice(0, 4);
    var deleting = event.inputType && event.inputType.indexOf("delete") === 0;
    inputs.expiry.value = digits.length > 2 || (digits.length === 2 && !deleting)
      ? digits.slice(0, 2) + "/" + digits.slice(2)
      : digits;
  });

  inputs.cvc.addEventListener("input", function () {
    inputs.cvc.value = inputs.cvc.value.replace(/\D/g, "").slice(0, 4);
  });

  Object.keys(inputs).forEach(function (k) {
    inputs[k].addEventListener("input", function () {
      if (inputs[k].getAttribute("aria-invalid")) K.setFieldError(inputs[k], "");
    });
  });

  form.querySelectorAll("input[name=method]").forEach(function (i) {
    i.addEventListener("change", syncMethod);
  });

  // ---- submit ----------------------------------------------------------------

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    clearErrors();

    var m = method();
    var body = { method: m, reference: inputs.reference.value.trim() };
    if (m === "Mobile Money") body.phone = inputs.phone.value;
    if (m === "Card") {
      body.cardNumber = inputs.cardNumber.value;
      body.expiry = inputs.expiry.value;
      body.cvc = inputs.cvc.value;
    }

    payBtn.disabled = true;
    payBtn.textContent = "Confirming…";

    K.api("/api/reservations/" + encodeURIComponent(serial) + "/payment", { method: "POST", body: body })
      .then(function () {
        window.location.assign("ticket.html?serial=" + encodeURIComponent(serial));
      })
      .catch(function (err) {
        payBtn.disabled = false;
        payBtn.textContent = "Confirm payment";
        var fields = (err.data && err.data.fields) || {};
        var first = null;
        Object.keys(fields).forEach(function (k) {
          if (!inputs[k]) return;
          K.setFieldError(inputs[k], fields[k]);
          first = first || inputs[k];
        });
        if (fields.method) payError.textContent = fields.method;
        else if (!first) payError.textContent = err.message;
        if (first) first.focus();
        if (err.status === 409) blocked(err.message);
      });
  });

  // ---- load ------------------------------------------------------------------

  if (!/^\d{5}$/.test(serial)) {
    window.location.replace("reservations.html");
    return;
  }

  syncMethod();

  K.api("/api/reservations/" + encodeURIComponent(serial))
    .then(function (res) {
      var r = res.reservation;
      render(r);
      if (r.display === "Paid") {
        window.location.replace("ticket.html?serial=" + encodeURIComponent(serial));
        return;
      }
      if (!r.can.pay) {
        blocked(r.status === "Cancelled" ? "This reservation was cancelled." : "This reservation has ended.");
        return;
      }
      if (r.payment.status === "Failed") {
        payError.textContent = "The last payment attempt failed. Try again or choose another method.";
      }
      payBtn.disabled = false;
    })
    .catch(function (err) {
      if (err.status === 404) blocked("Reservation not found.");
      else payError.textContent = err.message;
    })
    .then(function () {
      main.removeAttribute("aria-busy");
    });
})();

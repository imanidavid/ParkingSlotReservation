// Theme toggle: explicit choice is stored; otherwise follow the OS.
(function () {
  var KEY = "karita-theme";
  var root = document.documentElement;
  var media = window.matchMedia("(prefers-color-scheme: dark)");

  function stored() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  function current() {
    return stored() || (media.matches ? "dark" : "light");
  }

  function render() {
    var theme = current();
    document.querySelectorAll("[data-set-theme]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.dataset.setTheme === theme));
    });
  }

  function apply(theme) {
    root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch (e) {}
    render();
  }

  // Set early to avoid a flash of the wrong theme.
  var saved = stored();
  if (saved) root.setAttribute("data-theme", saved);

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-set-theme]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        apply(btn.dataset.setTheme);
      });
    });
    render();
  });

  media.addEventListener("change", function () {
    if (!stored()) render();
  });
})();

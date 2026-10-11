import { useTheme } from "../lib/hooks.js";

export default function ThemeToggle() {
  const [theme, choose] = useTheme();
  return (
    <div className="theme-toggle" role="group" aria-label="Colour theme">
      <button type="button" data-set-theme="light" aria-pressed={String(theme === "light")} onClick={() => choose("light")}>
        Light
      </button>
      <span aria-hidden="true">/</span>
      <button type="button" data-set-theme="dark" aria-pressed={String(theme === "dark")} onClick={() => choose("dark")}>
        Dark
      </button>
    </div>
  );
}

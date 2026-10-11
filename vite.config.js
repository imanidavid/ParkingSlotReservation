import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const PAGES = [
  "login", "register", "home", "browse", "facility",
  "pay", "ticket", "reservations", "attendant", "admin",
];

// Multi-page build, deliberately: every page keeps the URL it already had
// (/home.html, /admin.html …) because PageAccessFilter gates access per page
// path and sends each role to its own. A single-page bundle with client-side
// routing would move that decision into the browser, where it can't be
// enforced. See ARCHITECTURE.md §8.
export default defineConfig({
  root: "frontend",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(
        PAGES.map((p) => [p, resolve(import.meta.dirname, "frontend", `${p}.html`)]),
      ),
    },
  },
  server: {
    // `npm run dev` serves the pages with HMR and forwards the API and the
    // OAuth2 round-trip to the running backend, so the session cookie still
    // works from the dev origin.
    proxy: Object.fromEntries(
      ["/api", "/logout", "/oauth2", "/login/oauth2"].map((p) => [
        p,
        { target: "http://localhost:8080", changeOrigin: false },
      ]),
    ),
  },
});

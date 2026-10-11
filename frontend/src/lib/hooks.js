import { useCallback, useEffect, useRef, useState } from "react";
import { onOffline } from "./api.js";

const THEME_KEY = "karita-theme";

function storedTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

/**
 * Explicit choice wins and is remembered; otherwise follow the OS and keep
 * following it. The <head> of every page applies the stored value before first
 * paint — this hook only owns the toggle from then on.
 */
export function useTheme() {
  const [theme, setTheme] = useState(
    () => storedTheme() || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (!storedTheme()) setTheme(media.matches ? "dark" : "light");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const choose = useCallback((next) => {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* private mode: the choice just doesn't outlive the tab */
    }
    setTheme(next);
  }, []);

  return [theme, choose];
}

/** True while the last api() call couldn't reach the server at all. */
export function useOffline() {
  const [down, setDown] = useState(false);
  useEffect(() => onOffline(setDown), []);
  return down;
}

/**
 * Field errors keyed by input id, with the clear-on-type behaviour every form
 * here shares: once you start fixing a field, its message gets out of the way.
 */
export function useFieldErrors(initial = {}) {
  const [errors, setErrors] = useState(initial);
  const clear = useCallback((name) => {
    setErrors((prev) => (prev[name] ? { ...prev, [name]: "" } : prev));
  }, []);
  const props = useCallback(
    (name) => ({
      id: name,
      "aria-invalid": errors[name] ? "true" : undefined,
      "aria-describedby": `${name}-error`,
    }),
    [errors],
  );
  return { errors, setErrors, clear, props };
}

/** Focus the first input named in `order` that currently has an error. */
export function useFocusFirstError(errors, order) {
  const previous = useRef(errors);
  useEffect(() => {
    if (previous.current === errors) return;
    previous.current = errors;
    const first = order.find((name) => errors[name]);
    if (first) document.getElementById(first)?.focus();
  }, [errors, order]);
}

/** setInterval that pauses while the tab is hidden and cleans itself up. */
export function usePoll(fn, ms) {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) latest.current();
    }, ms);
    return () => clearInterval(id);
  }, [ms]);
}

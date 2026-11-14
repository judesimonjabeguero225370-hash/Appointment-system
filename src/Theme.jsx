import { useEffect, useState } from "react";

const KEY = "qorvena-theme";
const stored = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const currentTheme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function applyTheme(theme, save = true) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0e1715" : "#2f6f63");
  if (save) { try { localStorage.setItem(KEY, theme); } catch { /* storage blocked */ } }
  window.dispatchEvent(new Event("qorvena-theme"));
}

/** Call once at start-up: use the saved choice, otherwise follow the device setting (and keep following it until the user picks). */
export function initTheme() {
  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  applyTheme(stored() || (media && media.matches ? "dark" : "light"), false);
  if (media && media.addEventListener) media.addEventListener("change", (e) => { if (!stored()) applyTheme(e.matches ? "dark" : "light", false); });
}

export function useTheme() {
  const [theme, setTheme] = useState(currentTheme);
  useEffect(() => { const sync = () => setTheme(currentTheme()); window.addEventListener("qorvena-theme", sync); return () => window.removeEventListener("qorvena-theme", sync); }, []);
  return [theme, () => applyTheme(theme === "dark" ? "light" : "dark")];
}

/** A sliding sun/moon switch. */
export default function ThemeToggle({ className = "" }) {
  const [theme, toggle] = useTheme();
  const dark = theme === "dark";
  return <button type="button" className={`theme-toggle ${className}`} role="switch" aria-checked={dark} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"} onClick={toggle}>
    <span className="tt-track" aria-hidden="true">
      <svg className="tt-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7L7 17M17 7l1.7-1.7" /></svg>
      <svg className="tt-moon" viewBox="0 0 24 24"><path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2Z" /></svg>
      <span className="tt-thumb" />
    </span>
  </button>;
}

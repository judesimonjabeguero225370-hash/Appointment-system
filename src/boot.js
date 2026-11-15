const MIN_SHOW_MS = 700; // counted from the start of the page load, so a slow load never waits extra

/** Fades out the first-load splash (see #boot in index.html). Safe to call more than once. */
export function hideBoot() {
  const el = document.getElementById("boot");
  if (!el) return;
  const wait = Math.max(0, MIN_SHOW_MS - (window.performance ? performance.now() : MIN_SHOW_MS));
  setTimeout(() => { el.classList.add("qv-hide"); setTimeout(() => el.remove(), 600); }, wait);
}

/** Small, dependency-free interaction effects: button ripples + a soft cursor spotlight on cards. */
const RIPPLE_TARGETS = ".btn, .icon-btn, .about-link, .quick button, .social, .fab, .show-btn";

export function initFx() {
  if (typeof window === "undefined") return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  document.addEventListener("pointerdown", (e) => {
    const target = e.target.closest && e.target.closest(RIPPLE_TARGETS);
    if (!target || target.disabled) return;
    const box = target.getBoundingClientRect();
    const size = Math.max(box.width, box.height) * 2.2;
    const wave = document.createElement("span");
    wave.className = "ripple";
    wave.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - box.left - size / 2}px;top:${e.clientY - box.top - size / 2}px`;
    target.appendChild(wave);
    setTimeout(() => wave.remove(), 700);
  }, { passive: true });

  let frame = 0;
  document.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    const card = e.target.closest && e.target.closest(".spot");
    if (!card || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const box = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - box.left}px`);
      card.style.setProperty("--my", `${e.clientY - box.top}px`);
    });
  }, { passive: true });
}

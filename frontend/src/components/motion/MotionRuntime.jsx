import { useEffect } from "react";

// One set of document listeners that power the small details everywhere:
// - cursor position for the glow on solid buttons and the light on cards
// - a ripple from the exact press point on buttons
// Cheap: the pointer handler only writes two CSS variables on the hovered element.
export default function MotionRuntime() {
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let last = null;
    const onMove = (e) => {
      if (e.pointerType === "touch") return;
      last = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = last.target?.closest?.(".dd-solid, .dd-spot");
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${last.clientX - r.left}px`);
        el.style.setProperty("--my", `${last.clientY - r.top}px`);
      });
    };
    const onDown = (e) => {
      if (reduced?.matches || e.button > 0) return;
      const btn = e.target?.closest?.(".dd-btn");
      if (!btn || btn.disabled) return;
      const r = btn.getBoundingClientRect();
      let host = btn.querySelector(":scope > .dd-ripple-host");
      if (!host) {
        host = document.createElement("span");
        host.className = "dd-ripple-host";
        host.setAttribute("aria-hidden", "true");
        btn.prepend(host);
      }
      const size = Math.max(r.width, r.height) * 2.4;
      const dot = document.createElement("span");
      dot.className = "dd-ripple";
      dot.style.width = dot.style.height = `${size}px`;
      dot.style.left = `${e.clientX - r.left}px`;
      dot.style.top = `${e.clientY - r.top}px`;
      host.appendChild(dot);
      dot.addEventListener("animationend", () => dot.remove(), { once: true });
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", onDown);
      cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}

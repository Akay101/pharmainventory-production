import { useLayoutEffect, useRef } from "react";

// A pill (or underline) that glides to whichever child of the parent is
// active, so switching tabs moves one shape instead of two snapping.
//
// Drop it as the first child of a `relative` row of tabs. The active tab is the
// child matching `active` (default: aria-selected / data-state=active /
// aria-current=page / data-active=true). The glider sits behind the tabs; tabs
// keep their own active text colour, and their active background is hidden by
// the CSS rule `.dd-glide-row > [data-active-bg]` style hooks below.
//
// variant: "pill" (fills the tab) | "line" (2px bar under the tab)
const ACTIVE = '[aria-selected="true"], [data-state="active"], [aria-current="page"], [data-active="true"], [aria-pressed="true"]';

export default function Glider({ active = ACTIVE, variant = "pill", className = "" }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const row = el?.parentElement;
    if (!row) return;
    let first = true;
    const place = () => {
      const target = [...row.children].find((c) => c !== el && c.matches(active));
      if (!target || !target.offsetWidth) {
        el.style.opacity = "0";
        return;
      }
      const x = target.offsetLeft;
      const y = target.offsetTop;
      const w = target.offsetWidth;
      const h = target.offsetHeight;
      el.style.transition = first ? "none" : "";
      el.style.opacity = "1";
      el.style.width = `${w}px`;
      if (variant === "line") {
        el.style.transform = `translate3d(${x}px, ${y + h - 2}px, 0)`;
      } else {
        el.style.height = `${h}px`;
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        el.style.borderRadius = getComputedStyle(target).borderRadius;
      }
      first = false;
    };
    place();
    // Re-place when the active tab changes (attribute flips) or the row resizes
    const mo = new MutationObserver(place);
    mo.observe(row, { subtree: true, attributes: true, attributeFilter: ["aria-selected", "data-state", "aria-current", "data-active", "aria-pressed", "class"], childList: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
    ro?.observe(row);
    window.addEventListener("resize", place);
    return () => {
      mo.disconnect();
      ro?.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [active, variant]);

  return <span ref={ref} aria-hidden className={`dd-glider dd-glider-${variant} ${className}`} />;
}

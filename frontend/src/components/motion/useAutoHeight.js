import { useCallback, useEffect } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// When a window's content grows or shrinks (a field reveals more fields, a
// lookup returns details), tween its height instead of jumping. The observer
// fires after layout and before paint, so the old height is shown on the first
// frame and the box then glides to the new one. Works on any element whose
// height is "auto" (capped elements that scroll simply don't change size).
export function useAutoHeight(ref, enabled = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || typeof ResizeObserver === "undefined") return;
    let last = null;
    let anim = null;
    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height;
      // Skip the first measure, the open animation and tiny changes
      if (last === null || el.getAnimations?.().some((a) => a !== anim && a.playState === "running")) {
        last = h;
        return;
      }
      const from = anim?.playState === "running" ? parseFloat(getComputedStyle(el).height) : last;
      last = h;
      if (Math.abs(h - from) < 6 || reduced()) return;
      anim?.cancel();
      anim = el.animate([{ height: `${from}px`, overflow: "hidden" }, { height: `${h}px`, overflow: "hidden" }], {
        duration: Math.min(520, 260 + Math.abs(h - from) * 0.6),
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      anim?.cancel();
    };
  }, [ref, enabled]);
}

// Merge a forwarded ref with a local one
export function useMergedRef(a, b) {
  return useCallback(
    (node) => {
      for (const r of [a, b]) {
        if (typeof r === "function") r(node);
        else if (r) r.current = node;
      }
    },
    [a, b]
  );
}

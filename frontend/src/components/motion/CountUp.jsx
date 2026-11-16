import { useEffect, useRef, useState } from "react";

// Rolls a figure up from zero the first time it appears ("₹12,582", "409",
// "24.7%"). Anything that isn't a plain number renders as is.
const NUM = /^([^\d-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/;
const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function CountUp({ value, duration = 1100 }) {
  const text = typeof value === "number" ? String(value) : value;
  const m = typeof text === "string" ? text.match(NUM) : null;
  const [shown, setShown] = useState(m && !reduced() ? 0 : null);
  const done = useRef(false);

  useEffect(() => {
    if (!m || done.current || reduced()) return;
    const target = parseFloat(m[2].replace(/,/g, ""));
    if (!isFinite(target) || target === 0) {
      setShown(null);
      return;
    }
    done.current = true;
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(2, -10 * k); // expo-out, like the rest of the motion
      setShown(k >= 1 ? null : target * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      // Interrupted (remount, value change): never leave a half-counted figure
      cancelAnimationFrame(raf);
      done.current = false;
      setShown(null);
    };
  }, [text]);

  if (!m || shown === null) return <>{text}</>;
  const decimals = (m[2].split(".")[1] || "").length;
  const grouped = m[2].includes(",");
  const n = grouped
    ? shown.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : shown.toFixed(decimals);
  return (
    <>
      {m[1]}
      {n}
      {m[3]}
    </>
  );
}

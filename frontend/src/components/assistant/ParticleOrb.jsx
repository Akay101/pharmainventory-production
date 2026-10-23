import { useEffect, useRef } from "react";

// A small swirl of glowing particles around a pulsing core: the "AI is
// working" mark while a reply is being thought out or streamed.
const COLORS = ["#f97316", "#fb923c", "#ec4899", "#d946ef", "#a855f7", "#6366f1"];

export default function ParticleOrb({ size = 28, count = 42, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    const c = size / 2;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const parts = Array.from({ length: count }, (_, i) => ({
      r: c * (0.32 + Math.random() * 0.6), // orbit radius
      a: Math.random() * Math.PI * 2, // angle
      v: (0.6 + Math.random() * 1.4) * (i % 3 === 0 ? -1 : 1), // speed and direction
      tilt: 0.45 + Math.random() * 0.55, // flatten the orbit into an ellipse
      spin: Math.random() * Math.PI, // orbit rotation
      s: 0.5 + Math.random() * 1.1, // dot size
      color: COLORS[i % COLORS.length],
      phase: Math.random() * Math.PI * 2,
    }));

    let raf = 0;
    let last = performance.now();
    const draw = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, size, size);

      // Core glow
      const pulse = 0.75 + 0.25 * Math.sin(now / 380);
      const g = ctx.createRadialGradient(c, c, 0, c, c, c * 0.55);
      g.addColorStop(0, `rgba(236, 72, 153, ${0.55 * pulse})`);
      g.addColorStop(0.5, `rgba(168, 85, 247, ${0.25 * pulse})`);
      g.addColorStop(1, "rgba(168, 85, 247, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c, c, c * 0.55, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = "lighter";
      for (const p of parts) {
        if (!reduce) p.a += p.v * dt * 1.6;
        const breathe = 1 + 0.08 * Math.sin(now / 500 + p.phase);
        const ex = Math.cos(p.a) * p.r * breathe;
        const ey = Math.sin(p.a) * p.r * p.tilt * breathe;
        const x = c + ex * Math.cos(p.spin) - ey * Math.sin(p.spin);
        const y = c + ex * Math.sin(p.spin) + ey * Math.cos(p.spin);
        // Particles in front of the core read brighter than the ones behind it
        const depth = 0.45 + 0.55 * ((Math.sin(p.a) + 1) / 2);
        ctx.globalAlpha = depth;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(x, y, p.s * (size / 28) * depth, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = "source-over";
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size, count]);

  return <canvas ref={ref} aria-hidden="true" style={{ width: size, height: size }} className={className} />;
}

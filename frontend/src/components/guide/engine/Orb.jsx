import { useEffect, useRef } from "react";

// The assistant's particle orb, drawn for tours. Same look as
// assistant/ParticleOrb, but each particle's glow is a small pre-rendered
// sprite instead of a canvas shadow (shadows are re-blurred every frame and
// were the costliest thing on screen), and it stops drawing while the tab is
// hidden.
const COLORS = ["#f97316", "#fb923c", "#ec4899", "#d946ef", "#a855f7", "#6366f1"];
const SPRITE = 32;
let sprites = null;

function makeSprites() {
  if (sprites) return sprites;
  sprites = COLORS.map((color) => {
    const c = document.createElement("canvas");
    c.width = c.height = SPRITE;
    const g = c.getContext("2d");
    const r = SPRITE / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.18, color);
    grad.addColorStop(0.42, `${color}99`);
    grad.addColorStop(1, `${color}00`);
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE, SPRITE);
    return c;
  });
  return sprites;
}

export default function Orb({ size = 28, count = 42, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    const c = size / 2;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const sp = makeSprites();
    const scale = size / 28;

    const parts = Array.from({ length: count }, (_, i) => ({
      r: c * (0.32 + Math.random() * 0.6),
      a: Math.random() * Math.PI * 2,
      v: (0.6 + Math.random() * 1.4) * (i % 3 === 0 ? -1 : 1),
      tilt: 0.45 + Math.random() * 0.55,
      spin: Math.random() * Math.PI,
      s: 0.5 + Math.random() * 1.1,
      sprite: sp[i % sp.length],
      phase: Math.random() * Math.PI * 2,
    }));

    let raf = 0;
    let last = performance.now();
    const draw = (now) => {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, size, size);

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
        const depth = 0.45 + 0.55 * ((Math.sin(p.a) + 1) / 2);
        ctx.globalAlpha = depth;
        // Dot plus its glow, about what a 4px shadow gave
        const d = (p.s * scale * depth + 4) * 2;
        ctx.drawImage(p.sprite, x - d / 2, y - d / 2, d, d);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      if (!reduce && !document.hidden) raf = requestAnimationFrame(draw);
    };
    const onVisible = () => {
      if (!document.hidden && !raf && !reduce) {
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [size, count]);

  return <canvas ref={ref} aria-hidden="true" style={{ width: size, height: size }} className={className} />;
}

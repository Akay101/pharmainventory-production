// KEEP IN SYNC: this file is copied verbatim between
//   admin-frontend/src/components/broadcast/BroadcastRender.jsx (composer preview)
//   frontend/src/components/broadcast/BroadcastRender.jsx       (what users see)
// so the admin preview is exactly what users get. It only renders; fetching,
// seen tracking and navigation belong to the app around it.
//
// Colours come from CSS variables set on the root (light or dark), not from
// Tailwind dark: classes, because the two apps configure dark mode differently.
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ChevronLeft, ChevronRight, CircleCheck, Clock, Gift, Info, Lightbulb, Megaphone, Quote, Rocket, Sparkles, TriangleAlert, X } from "lucide-react";

export const THEMES = {
  sunset: { label: "Sunset", from: "#f97316", via: "#ec4899", to: "#8b5cf6" },
  brand: { label: "DavaDesk", from: "#ea580c", via: "#f97316", to: "#fb923c" },
  ocean: { label: "Ocean", from: "#0ea5e9", via: "#2563eb", to: "#4f46e5" },
  violet: { label: "Violet", from: "#7c3aed", via: "#a21caf", to: "#db2777" },
  emerald: { label: "Emerald", from: "#059669", via: "#0d9488", to: "#0891b2" },
  midnight: { label: "Midnight", from: "#0f172a", via: "#312e81", to: "#1e1b4b" },
  gold: { label: "Gold", from: "#d97706", via: "#ea580c", to: "#b45309" },
  rose: { label: "Rose", from: "#e11d48", via: "#db2777", to: "#9333ea" },
};

export const KIND_META = {
  ANNOUNCEMENT: { label: "New update", short: "Update", Icon: Megaphone },
  PROMOTION: { label: "Special offer", short: "Offer", Icon: Gift },
  COMING_SOON: { label: "Coming soon", short: "Coming soon", Icon: Rocket },
};

const hexRgb = (h) => {
  const n = parseInt(String(h || "#000000").slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (h, a) => `rgba(${hexRgb(h).join(",")},${a})`;
const luminance = (h) => {
  const [r, g, b] = hexRgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// { from, via, to, accent, onDark } for a broadcast's theme
export function palette(theme = {}) {
  if (theme.preset === "custom" && theme.from && theme.to) {
    const onDark = (luminance(theme.from) + luminance(theme.to)) / 2 < 0.45;
    return { from: theme.from, via: theme.from, to: theme.to, accent: theme.from, onDark };
  }
  const p = THEMES[theme.preset] || THEMES.sunset;
  return { ...p, accent: theme.preset === "midnight" ? "#6366f1" : p.from, onDark: true };
}

const PATTERNS = {
  dots: { backgroundImage: "radial-gradient(rgba(255,255,255,.22) 1px, transparent 1.4px)", backgroundSize: "14px 14px" },
  grid: {
    backgroundImage: "linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)",
    backgroundSize: "22px 22px",
  },
  stripes: { backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,.08) 0 12px, transparent 12px 26px)" },
};

export function heroStyle(theme = {}) {
  const p = palette(theme);
  return { background: `linear-gradient(120deg, ${p.from} 0%, ${p.via} 55%, ${p.to} 100%)`, color: p.onDark ? "#ffffff" : "#0f172a" };
}

// Decorative layers inside a gradient surface (pattern, glow, shine)
function Decor({ theme = {}, shine = false }) {
  const pattern = PATTERNS[theme.pattern];
  return (
    <>
      {pattern && <div aria-hidden className="pointer-events-none absolute inset-0" style={pattern} />}
      {(theme.pattern === "glow" || !theme.pattern) && (
        <>
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full" style={{ background: "rgba(255,255,255,.22)", filter: "blur(40px)" }} />
          <div aria-hidden className="pointer-events-none absolute -bottom-20 left-1/3 h-44 w-44 rounded-full" style={{ background: "rgba(255,255,255,.14)", filter: "blur(46px)" }} />
        </>
      )}
      {shine && <div aria-hidden className="bc-shine pointer-events-none absolute inset-y-0 -left-1/2 w-1/3" />}
    </>
  );
}

// Light / dark surface variables for the details content
const VARS = {
  light: { "--bc-bg": "#ffffff", "--bc-fg": "#0f172a", "--bc-text": "#334155", "--bc-muted": "#64748b", "--bc-card": "#f8fafc", "--bc-border": "#e2e8f0" },
  dark: { "--bc-bg": "#0b1220", "--bc-fg": "#f1f5f9", "--bc-text": "#cbd5e1", "--bc-muted": "#94a3b8", "--bc-card": "#111a2e", "--bc-border": "#1e293b" },
};
const C = { fg: "var(--bc-fg)", text: "var(--bc-text)", muted: "var(--bc-muted)", card: "var(--bc-card)", border: "var(--bc-border)", bg: "var(--bc-bg)" };

const STYLE = `
@keyframes bc-shine { 0% { transform: translateX(0) skewX(-18deg); } 100% { transform: translateX(450%) skewX(-18deg); } }
.bc-shine { background: linear-gradient(90deg, transparent, rgba(255,255,255,.28), transparent); animation: bc-shine 3.6s ease-in-out infinite; animation-delay: 1.2s; }
@keyframes bc-float { 0%,100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-6px) rotate(-1deg); } }
.bc-float { animation: bc-float 5s ease-in-out infinite; }
@keyframes bc-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.bc-in { animation: bc-in .45s cubic-bezier(.2,.8,.2,1) both; }
@keyframes bc-notif-in {
  0% { opacity: 0; transform: translate3d(36px, -14px, 0) scale(.92); filter: blur(8px); }
  55% { opacity: 1; transform: translate3d(-5px, 2px, 0) scale(1.012); filter: blur(0); }
  78% { transform: translate3d(2px, 0, 0) scale(.998); }
  100% { opacity: 1; transform: none; filter: none; }
}
.bc-notif-in { animation: bc-notif-in .75s cubic-bezier(.16,1,.3,1) both; }
@keyframes bc-notif-out { to { opacity: 0; transform: translate3d(40px, 0, 0) scale(.94); filter: blur(4px); } }
.bc-notif-out { animation: bc-notif-out .28s cubic-bezier(.4,0,1,1) forwards; }
@keyframes bc-border { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
.bc-border { background-size: 200% 200%; animation: bc-border 6s linear infinite; }
@keyframes bc-glow { 0%,100% { opacity: .45; } 50% { opacity: .8; } }
.bc-glow { animation: bc-glow 3.2s ease-in-out infinite; }
@keyframes bc-ping { 0% { transform: scale(1); opacity: .7; } 80%,100% { transform: scale(2.4); opacity: 0; } }
.bc-ping { animation: bc-ping 1.8s cubic-bezier(0,0,.2,1) infinite; }
@keyframes bc-pop { 0% { opacity: 0; transform: translateY(6px) scale(.96); } 100% { opacity: 1; transform: none; } }
.bc-pop { animation: bc-pop .5s cubic-bezier(.16,1,.3,1) both; }
@keyframes bc-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.bc-progress { transform-origin: left; animation-name: bc-progress; animation-timing-function: linear; animation-fill-mode: forwards; }
@keyframes bc-zoom-in { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: none; } }
.bc-zoom-in { animation: bc-zoom-in .3s cubic-bezier(.16,1,.3,1) both; }
@media (prefers-reduced-motion: reduce) { .bc-shine, .bc-float, .bc-in, .bc-notif-in, .bc-border, .bc-glow, .bc-ping, .bc-pop, .bc-zoom-in { animation: none; } }
`;
export const BroadcastStyles = () => <style>{STYLE}</style>;

export const imageSrc = (img, assetUrl) => (!img ? null : img.asset_id ? assetUrl?.(img.asset_id) : img.url || null);

const isInternal = (l) => typeof l === "string" && l.startsWith("/");
const isSafeLink = (l) => isInternal(l) || /^https:\/\//i.test(l || "");

// Link or button that sends in-app paths to onLink and opens https links in a new tab
function Go({ link, onLink, className, style, children }) {
  if (!isSafeLink(link)) return <span className={className} style={style}>{children}</span>;
  if (isInternal(link) && onLink)
    return (
      <button type="button" onClick={() => onLink(link)} className={className} style={style}>
        {children}
      </button>
    );
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => onLink?.(link, { external: true })} className={className} style={style}>
      {children}
    </a>
  );
}

// **bold**, *italic*, [label](link) and line breaks; everything else is plain text
function Inline({ text, onLink, accent }) {
  const parts = String(text || "").split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\([^)\s]+\))/g);
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i} style={{ color: C.fg }}>{p.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    const m = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (m)
      return (
        <Go key={i} link={m[2]} onLink={onLink} className="font-semibold underline underline-offset-2" style={{ color: accent }}>
          {m[1]}
        </Go>
      );
    return p.split("\n").map((line, j, all) => (
      <React.Fragment key={`${i}-${j}`}>
        {line}
        {j < all.length - 1 && <br />}
      </React.Fragment>
    ));
  });
}

export function RichText({ text, onLink, accent, className = "", style }) {
  const paras = String(text || "").split(/\n{2,}/);
  return (
    <div className={className} style={style}>
      {paras.map((p, i) => (
        <p key={i} className={i ? "mt-3" : ""}>
          <Inline text={p} onLink={onLink} accent={accent} />
        </p>
      ))}
    </div>
  );
}

function Countdown({ target, label, accent }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(target).getTime() - now;
  const parts = ms > 0 ? [["Days", Math.floor(ms / 864e5)], ["Hours", Math.floor(ms / 36e5) % 24], ["Mins", Math.floor(ms / 6e4) % 60], ["Secs", Math.floor(ms / 1e3) % 60]] : null;
  return (
    <div className="rounded-2xl p-4 text-center" style={{ background: rgba(accent, 0.08), border: `1px solid ${rgba(accent, 0.25)}` }}>
      {label && <p className="mb-3 text-xs font-bold uppercase tracking-wider" style={{ color: accent }}>{label}</p>}
      {parts ? (
        <div className="flex justify-center gap-2 sm:gap-3">
          {parts.map(([k, v]) => (
            <div key={k} className="min-w-[60px] rounded-xl px-2 py-2.5 shadow-sm" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
              <div className="text-2xl font-black tabular-nums" style={{ color: C.fg }}>{String(v).padStart(2, "0")}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.muted }}>{k}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-lg font-extrabold" style={{ color: accent }}>🎉 It's here!</p>
      )}
    </div>
  );
}

const CALLOUTS = {
  info: { color: "#2563eb", Icon: Info },
  success: { color: "#059669", Icon: CircleCheck },
  warning: { color: "#d97706", Icon: TriangleAlert },
  tip: { color: "#7c3aed", Icon: Lightbulb },
  new: { color: null, Icon: Sparkles },
};

const IMG_H = { sm: 160, md: 240, lg: 340 };
// Full class names so Tailwind keeps them
const STAT_COLS = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" };

const youtubeId = (url) => {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    const id = host === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v") || u.pathname.match(/^\/(embed|shorts|live)\/([^/?]+)/)?.[2];
    return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
};

function Block({ b, accent, assetUrl, onLink, onZoom }) {
  const center = b.align === "center" ? "text-center" : "";
  switch (b.type) {
    case "heading": {
      const size = b.size === "lg" ? "text-2xl sm:text-[28px]" : b.size === "sm" ? "text-base" : "text-xl";
      return <h3 className={`${size} ${center} font-extrabold leading-tight tracking-tight`} style={{ color: C.fg }}>{b.text}</h3>;
    }
    case "text": {
      const tone = b.tone === "lead" ? "text-[15px] sm:text-base font-medium" : b.tone === "muted" ? "text-[13px]" : "text-sm";
      return <RichText text={b.text} onLink={onLink} accent={accent} className={`${tone} ${center} leading-relaxed`} style={{ color: b.tone === "muted" ? C.muted : C.text }} />;
    }
    case "image": {
      const src = imageSrc(b.image, assetUrl);
      if (!src) return null;
      return (
        <figure>
          <img
            src={src}
            alt={b.alt || ""}
            loading="lazy"
            onClick={() => onZoom?.(src)}
            className="w-full cursor-zoom-in rounded-2xl shadow-sm"
            style={{ height: b.height === "auto" ? "auto" : IMG_H[b.height] || 240, objectFit: b.fit || "cover", background: C.card, border: `1px solid ${C.border}` }}
          />
          {b.caption && <figcaption className="mt-2 text-center text-xs" style={{ color: C.muted }}>{b.caption}</figcaption>}
        </figure>
      );
    }
    case "gallery":
      return (
        <div className={`grid gap-2.5 ${b.columns === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}>
          {b.images.map((g, i) => {
            const src = imageSrc(g.image, assetUrl);
            return (
              src && (
                <figure key={i} className="group overflow-hidden rounded-xl" style={{ border: `1px solid ${C.border}`, background: C.card }}>
                  <img src={src} alt={g.caption || ""} loading="lazy" onClick={() => onZoom?.(src)} className="aspect-[4/3] w-full cursor-zoom-in object-cover transition-transform duration-300 group-hover:scale-105" />
                  {g.caption && <figcaption className="px-2.5 py-1.5 text-[11px] font-medium" style={{ color: C.muted }}>{g.caption}</figcaption>}
                </figure>
              )
            );
          })}
        </div>
      );
    case "callout": {
      const v = CALLOUTS[b.variant] || CALLOUTS.info;
      const color = v.color || accent;
      return (
        <div className="flex gap-3 rounded-2xl p-4" style={{ background: rgba(color, 0.08), border: `1px solid ${rgba(color, 0.28)}` }}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-base" style={{ background: rgba(color, 0.15), color }}>
            {b.emoji || <v.Icon className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            {b.title && <p className="text-sm font-extrabold" style={{ color }}>{b.title}</p>}
            <RichText text={b.text} onLink={onLink} accent={color} className="text-[13px] leading-relaxed" style={{ color: C.text }} />
          </div>
        </div>
      );
    }
    case "features":
      return (
        <div className={`grid gap-3 ${b.columns === 3 ? "sm:grid-cols-3" : b.columns === 1 ? "" : "sm:grid-cols-2"}`}>
          {b.items.map((f, i) => (
            <div key={i} className="rounded-2xl p-4 transition-transform duration-200 hover:-translate-y-0.5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
              <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl text-xl" style={{ background: rgba(accent, 0.12), color: accent }}>
                {f.emoji || <Sparkles className="h-5 w-5" />}
              </div>
              <p className="text-sm font-extrabold" style={{ color: C.fg }}>{f.title}</p>
              {f.text && <p className="mt-1 text-[13px] leading-relaxed" style={{ color: C.muted }}>{f.text}</p>}
            </div>
          ))}
        </div>
      );
    case "steps":
      return (
        <ol className="space-y-0">
          {b.items.map((s, i) => (
            <li key={i} className="relative flex gap-3.5 pb-4 last:pb-0">
              {i < b.items.length - 1 && <span aria-hidden className="absolute left-[15px] top-8 bottom-0 w-0.5" style={{ background: rgba(accent, 0.25) }} />}
              <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black text-white shadow" style={{ background: accent }}>
                {i + 1}
              </span>
              <div className="pt-1">
                <p className="text-sm font-extrabold" style={{ color: C.fg }}>{s.title}</p>
                {s.text && <p className="mt-0.5 text-[13px] leading-relaxed" style={{ color: C.muted }}>{s.text}</p>}
              </div>
            </li>
          ))}
        </ol>
      );
    case "stats":
      return (
        <div className={`grid gap-2.5 ${STAT_COLS[b.items.length] || STAT_COLS[4]}`}>
          {b.items.map((s, i) => (
            <div key={i} className="rounded-2xl p-3.5 text-center" style={{ background: rgba(accent, 0.07), border: `1px solid ${rgba(accent, 0.2)}` }}>
              <div className="text-2xl font-black tracking-tight sm:text-3xl" style={{ color: accent }}>{s.value}</div>
              <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted }}>{s.label}</div>
            </div>
          ))}
        </div>
      );
    case "button": {
      const base = "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-extrabold transition-transform duration-150 hover:scale-[1.03] active:scale-[0.98]";
      const style =
        b.style === "outline"
          ? { border: `2px solid ${accent}`, color: accent }
          : b.style === "secondary"
          ? { background: rgba(accent, 0.12), color: accent }
          : { background: accent, color: "#fff", boxShadow: `0 8px 20px -8px ${rgba(accent, 0.7)}` };
      return (
        <div className={center}>
          <Go link={b.link} onLink={onLink} className={base} style={style}>
            {b.label}
            <ArrowRight className="h-4 w-4" />
          </Go>
        </div>
      );
    }
    case "quote":
      return (
        <blockquote className="relative rounded-2xl p-5 pl-12" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          <Quote className="absolute left-4 top-4 h-5 w-5" style={{ color: accent }} />
          <p className="text-[15px] font-medium italic leading-relaxed" style={{ color: C.fg }}>{b.text}</p>
          {(b.author || b.role) && (
            <footer className="mt-2.5 text-xs" style={{ color: C.muted }}>
              <span className="font-bold" style={{ color: C.text }}>{b.author}</span>
              {b.author && b.role ? " · " : ""}
              {b.role}
            </footer>
          )}
        </blockquote>
      );
    case "video": {
      const id = youtubeId(b.url);
      if (!id) return null;
      return (
        <figure>
          <div className="relative w-full overflow-hidden rounded-2xl shadow-sm" style={{ paddingTop: "56.25%", background: "#000" }}>
            <iframe
              className="absolute inset-0 h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${id}?rel=0`}
              title={b.caption || "Video"}
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
          {b.caption && <figcaption className="mt-2 text-center text-xs" style={{ color: C.muted }}>{b.caption}</figcaption>}
        </figure>
      );
    }
    case "countdown":
      return <Countdown target={b.target} label={b.label} accent={accent} />;
    case "badges":
      return (
        <div className="flex flex-wrap gap-1.5">
          {b.items.map((t, i) => (
            <span key={i} className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: rgba(accent, 0.1), color: accent, border: `1px solid ${rgba(accent, 0.25)}` }}>
              {t}
            </span>
          ))}
        </div>
      );
    case "divider":
      if (b.style === "space") return <div className="h-4" />;
      if (b.style === "dots")
        return (
          <div className="flex justify-center gap-2 py-1" aria-hidden>
            {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: rgba(accent, 0.5) }} />)}
          </div>
        );
      return <hr style={{ borderColor: C.border }} />;
    default:
      return null;
  }
}

function Chip({ b, light = true }) {
  const meta = KIND_META[b.kind] || KIND_META.ANNOUNCEMENT;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider"
      style={light ? { background: "rgba(255,255,255,.2)", border: "1px solid rgba(255,255,255,.3)", backdropFilter: "blur(6px)" } : { background: "rgba(15,23,42,.08)" }}
    >
      <meta.Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

// A picture shown whole: contained over a blurred, zoomed copy of itself
function FullImage({ src, className = "", style, onClick, imgClass = "" }) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={style} onClick={onClick}>
      <img src={src} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-125 object-cover opacity-70" style={{ filter: "blur(18px) saturate(1.2)" }} />
      <img src={src} alt="" className={`relative h-full w-full object-contain ${imgClass}`} />
    </div>
  );
}

/**
 * The notification card: overview of one broadcast, floating over the app.
 * `pager` = { index, count, prev, next }; `rotateMs` draws the auto-advance
 * line (paused with `paused`). `dark` picks the card surface.
 */
export function BroadcastBanner({ b, assetUrl, onExplore, onClose, pager, rotateMs, paused = false, dark = false, className = "" }) {
  const p = palette(b.theme);
  const img = imageSrc(b.banner?.image, assetUrl) || imageSrc(b.cover, assetUrl);
  const meta = KIND_META[b.kind] || KIND_META.ANNOUNCEMENT;
  const ctaLabel = b.banner?.cta_label || (b.kind === "COMING_SOON" ? "See what's coming" : "View details");
  const [leaving, setLeaving] = useState(false);
  const gradient = `linear-gradient(120deg, ${p.from}, ${p.via}, ${p.to}, ${p.from})`;
  const surface = dark ? "rgba(13,18,32,.94)" : "rgba(255,255,255,.96)";
  const fg = dark ? "#f8fafc" : "#0f172a";
  const muted = dark ? "#94a3b8" : "#64748b";
  const close = () => {
    setLeaving(true);
    setTimeout(() => onClose?.(), 260);
  };
  const stacked = pager && pager.count > 1;
  return (
    <div className={`${leaving ? "bc-notif-out" : "bc-notif-in"} relative ${stacked ? "pb-2" : ""} ${className}`} role="status" aria-label={b.title}>
      <BroadcastStyles />
      {/* More waiting: two cards peeking out underneath */}
      {stacked && (
        <>
          <div aria-hidden className="absolute inset-x-6 bottom-0 h-6 rounded-b-2xl" style={{ background: surface, opacity: 0.45, boxShadow: "0 6px 16px -8px rgba(0,0,0,.35)" }} />
          <div aria-hidden className="absolute inset-x-3 bottom-1 h-6 rounded-b-2xl" style={{ background: surface, opacity: 0.75 }} />
        </>
      )}
      {/* Soft coloured glow behind the card */}
      <div aria-hidden className="bc-glow pointer-events-none absolute -inset-1 rounded-[22px]" style={{ background: gradient, filter: "blur(18px)", opacity: 0.5 }} />
      {/* Moving gradient border */}
      <div className="bc-border relative rounded-[18px] p-[1.5px]" style={{ background: gradient, boxShadow: `0 18px 40px -18px ${rgba(p.via, 0.65)}` }}>
        <div className="relative overflow-hidden rounded-[16.5px]" style={{ background: surface, color: fg, backdropFilter: "blur(16px)" }}>
          {img ? (
            <button type="button" onClick={onExplore} className="group relative block w-full" aria-label={`Open ${b.title}`}>
              <FullImage src={img} className="h-36 w-full" imgClass="transition-transform duration-500 group-hover:scale-[1.03]" />
              <div aria-hidden className="absolute inset-x-0 bottom-0 h-10" style={{ background: `linear-gradient(to top, ${surface}, transparent)` }} />
            </button>
          ) : (
            <div className="relative isolate h-1.5 overflow-hidden" style={heroStyle(b.theme)} />
          )}
          <div className="relative px-4 pb-3.5 pt-3">
            <div className="flex items-center gap-2 pr-7">
              <span className="relative flex h-2 w-2 shrink-0">
                {!b.state?.seen && <span className="bc-ping absolute inline-flex h-full w-full rounded-full" style={{ background: p.from }} />}
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: p.from }} />
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[.12em]" style={{ color: p.accent }}>
                <meta.Icon className="h-3 w-3" />
                {meta.label}
              </span>
              {b.eta_label && (
                <span className="inline-flex items-center gap-1 truncate text-[10px] font-bold" style={{ color: muted }}>
                  · <Clock className="h-3 w-3" /> {b.eta_label}
                </span>
              )}
            </div>
            <div className="bc-pop mt-2 flex items-start gap-3" style={{ animationDelay: "180ms" }}>
              {!img && (
                <div className="bc-float flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl text-white shadow-md" style={heroStyle(b.theme)}>
                  {b.emoji || <meta.Icon className="h-5 w-5" />}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 text-[14.5px] font-extrabold leading-snug tracking-tight">
                  {img && b.emoji ? `${b.emoji} ` : ""}
                  {b.title}
                </h3>
                <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed" style={{ color: muted }}>{b.summary}</p>
              </div>
            </div>
            <div className="bc-pop mt-3 flex items-center justify-between gap-2" style={{ animationDelay: "280ms" }}>
              <button
                type="button"
                onClick={onExplore}
                className="group inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[12.5px] font-extrabold text-white shadow-md transition-transform duration-150 hover:scale-[1.04] active:scale-[0.97]"
                style={{ background: `linear-gradient(120deg, ${p.from}, ${p.to})`, boxShadow: `0 8px 18px -8px ${rgba(p.via, 0.8)}` }}
              >
                {ctaLabel}
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
              {stacked && (
                <div className="flex items-center gap-0.5 text-[11px] font-bold tabular-nums" style={{ color: muted }}>
                  <button type="button" onClick={pager.prev} aria-label="Previous" className="flex h-6 w-6 items-center justify-center rounded-lg transition-colors hover:bg-black/5">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  {pager.index + 1}/{pager.count}
                  <button type="button" onClick={pager.next} aria-label="Next" className="flex h-6 w-6 items-center justify-center rounded-lg transition-colors hover:bg-black/5">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
          {stacked && rotateMs && (
            <div className="absolute inset-x-0 bottom-0 h-[2px]" style={{ background: dark ? "rgba(255,255,255,.06)" : "rgba(15,23,42,.05)" }}>
              <div key={`${b.id}-${pager.index}`} className="bc-progress h-full" style={{ background: gradient, animationDuration: `${rotateMs}ms`, animationPlayState: paused ? "paused" : "running" }} />
            </div>
          )}
          {onClose && (
            <button
              type="button"
              onClick={close}
              aria-label="Dismiss"
              className="absolute right-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur transition-transform duration-150 hover:scale-110"
              style={img ? { background: "rgba(15,23,42,.45)", color: "#fff" } : { background: dark ? "rgba(255,255,255,.08)" : "rgba(15,23,42,.06)", color: muted, top: 14 }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Full details (inside the app's modal): gradient header, cover, elements, main button.
 * `dark` picks the surface colours; `onLink(path)` handles in-app links.
 */
export function BroadcastDetail({ b, assetUrl, onLink, dark = false, footer = true }) {
  const p = palette(b.theme);
  const cover = imageSrc(b.cover, assetUrl) || imageSrc(b.banner?.image, assetUrl);
  const [zoom, setZoom] = useState(null);
  const vars = useMemo(() => VARS[dark ? "dark" : "light"], [dark]);
  const date = b.published_at || b.starts_at;
  return (
    <div style={{ ...vars, background: C.bg, color: C.text }} className="relative">
      <BroadcastStyles />
      <div className="relative isolate overflow-hidden px-5 pb-10 pt-6 sm:px-7" style={heroStyle(b.theme)}>
        <Decor theme={b.theme} shine />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip b={b} light={p.onDark} />
            {b.eta_label && (
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: "rgba(0,0,0,.18)" }}>
                <Clock className="h-3 w-3" /> {b.eta_label}
              </span>
            )}
          </div>
          <div className="mt-3 flex items-start gap-3">
            {b.emoji && <span className="bc-float text-4xl leading-none">{b.emoji}</span>}
            <div className="min-w-0">
              <h2 className="text-2xl font-black leading-tight tracking-tight sm:text-[28px]">{b.title}</h2>
              <p className="mt-1.5 text-sm font-medium opacity-90">{b.summary}</p>
              {date && <p className="mt-2 text-[11px] font-semibold opacity-75">{new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>}
            </div>
          </div>
        </div>
      </div>
      <div className="relative px-5 pb-6 sm:px-7">
        {cover && (
          <div className="relative z-10 -mt-6 mb-5 overflow-hidden rounded-2xl shadow-xl" style={{ border: `4px solid ${C.bg}`, background: C.card }}>
            <img src={cover} alt="" onClick={() => setZoom(cover)} className="block max-h-[60vh] w-full cursor-zoom-in object-contain" />
          </div>
        )}
        <div className={`space-y-5 ${cover ? "" : "pt-5"}`}>
          {(b.blocks || []).map((blk, i) => (
            <div key={blk.id || i} className="bc-in" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <Block b={blk} accent={p.accent} assetUrl={assetUrl} onLink={onLink} onZoom={setZoom} />
            </div>
          ))}
          {!b.blocks?.length && !cover && <p className="text-sm" style={{ color: C.muted }}>{b.summary}</p>}
        </div>
      </div>
      {footer && b.cta?.label && b.cta?.link && (
        <div className="sticky bottom-0 z-20 flex justify-end px-5 py-3.5 sm:px-7" style={{ background: C.bg, borderTop: `1px solid ${C.border}` }}>
          <Go
            link={b.cta.link}
            onLink={(l, o) => onLink?.(l, { ...o, cta: true })}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-extrabold text-white transition-transform duration-150 hover:scale-[1.03]"
            style={{ background: `linear-gradient(120deg, ${p.from}, ${p.to})`, boxShadow: `0 10px 24px -10px ${rgba(p.via, 0.8)}` }}
          >
            {b.cta.label}
            <ArrowRight className="h-4 w-4" />
          </Go>
        </div>
      )}
      {zoom &&
        // Portal: the modal around this is transformed, which would trap a fixed overlay inside it
        createPortal(
          <div data-bc-zoom className="bc-zoom-in fixed inset-0 z-[100000] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm" style={{ pointerEvents: "auto" }} onClick={() => setZoom(null)} role="dialog" aria-label="Image">
            <img src={zoom} alt="" className="max-h-[92vh] max-w-[94vw] rounded-xl object-contain shadow-2xl" />
            <button type="button" aria-label="Close image" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white">
              <X className="h-5 w-5" />
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}

// Small square thumbnail for lists (notification rows, admin table)
export function BroadcastThumb({ b, assetUrl, size = 40 }) {
  const img = imageSrc(b.banner?.image, assetUrl) || imageSrc(b.cover, assetUrl);
  const meta = KIND_META[b.kind] || KIND_META.ANNOUNCEMENT;
  return (
    <div className="relative shrink-0 overflow-hidden rounded-xl text-white" style={{ ...heroStyle(b.theme), width: size, height: size }}>
      {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-lg">{b.emoji || <meta.Icon className="h-4 w-4" />}</div>}
    </div>
  );
}

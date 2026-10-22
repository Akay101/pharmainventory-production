import { useEffect, useRef, useState } from "react";
import { Camera, Check, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { MATCH_META } from "./scanClient";

// Soft animated colour blobs behind the scanner screens
export function AiAmbient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="ai-blob absolute -top-24 -left-20 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />
      <div className="ai-blob absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-fuchsia-500/15 blur-3xl" style={{ animationDelay: "-3s" }} />
      <div className="ai-blob absolute -bottom-24 left-1/4 h-72 w-72 rounded-full bg-violet-500/15 blur-3xl" style={{ animationDelay: "-6s" }} />
    </div>
  );
}

export function AiMark({ className = "h-9 w-9" }) {
  return (
    <div className={`${className} shrink-0 rounded-xl bg-gradient-to-br from-orange-500 via-pink-500 to-violet-500 p-[1.5px] shadow-lg shadow-fuchsia-500/20`}>
      <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-card">
        <Sparkles className="h-1/2 w-1/2 text-orange-500" />
      </div>
    </div>
  );
}

// Camera / gallery picker with thumbnails. Drag-and-drop on desktop.
export function PhotoTray({ photos, onAdd, onRemove, max = 6, disabled = false, hint, cameraLabel = "Take photo", size = "md" }) {
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const full = photos.length >= max;

  const take = (list) => {
    const files = Array.from(list || []).filter((f) => f.type?.startsWith("image/"));
    if (files.length) onAdd(files.slice(0, Math.max(0, max - photos.length)));
  };

  const thumb = size === "sm" ? "h-16 w-16" : "h-20 w-20 sm:h-24 sm:w-24";

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) take(e.dataTransfer.files);
      }}
      className={`rounded-2xl border border-dashed p-3 transition-colors ${dragging ? "border-orange-500 bg-orange-500/5" : "border-border bg-muted/20"}`}
    >
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { take(e.target.files); e.target.value = ""; }} />

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {photos.map((p, i) => (
          <div key={p.preview} className={`relative ${thumb} shrink-0 overflow-hidden rounded-xl border border-border bg-muted ai-pop-in`}>
            <img src={p.preview} alt="" className="h-full w-full object-cover" />
            {!disabled && (
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/80"
                aria-label="Remove photo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        {!full && !disabled && (
          <>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className={`${thumb} shrink-0 rounded-xl border border-orange-500/40 bg-orange-500/10 text-orange-500 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold hover:bg-orange-500/15 active:scale-95 transition`}
            >
              <Camera className="h-5 w-5" />
              {cameraLabel}
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className={`${thumb} shrink-0 rounded-xl border border-border bg-card text-muted-foreground flex flex-col items-center justify-center gap-1 text-[11px] font-semibold hover:text-foreground hover:bg-muted/60 active:scale-95 transition`}
            >
              <ImagePlus className="h-5 w-5" />
              Gallery
            </button>
          </>
        )}
      </div>
      {hint && <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// Advances through the visible steps while a scan runs, so the user sees the
// work happening even though the server does it in one go.
export function useScanSteps(running, stepMs = [500, 2200]) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!running) {
      setStep(0);
      return;
    }
    setStep(0);
    const timers = [];
    let acc = 0;
    stepMs.forEach((ms, i) => {
      acc += ms;
      timers.push(setTimeout(() => setStep(i + 1), acc));
    });
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line
  }, [running]);
  return step;
}

export function ScanningView({ photo, steps, active, title = "Reading with AI", subtitle }) {
  return (
    <div className="ai-glow-border rounded-2xl bg-card p-3 sm:p-4 ai-pop-in">
      <div className="flex gap-3 sm:gap-4">
        <div className="relative h-24 w-24 sm:h-28 sm:w-28 shrink-0 overflow-hidden rounded-xl bg-muted">
          {photo && <img src={photo} alt="" className="h-full w-full object-cover opacity-90" />}
          <div className="absolute inset-0 bg-gradient-to-b from-violet-500/10 to-orange-500/10" />
          <div className="ai-scan-beam" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold ai-shimmer-text">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          <ol className="mt-2 space-y-1.5">
            {steps.map((s, i) => (
              <li key={s} className={`flex items-center gap-2 text-xs transition-colors ${i < active ? "text-foreground" : i === active ? "text-foreground font-semibold" : "text-muted-foreground/60"}`}>
                <span className="flex h-4 w-4 items-center justify-center">
                  {i < active ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : i === active ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                  )}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

const TONES = {
  emerald: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  sky: "bg-sky-500/10 text-sky-500 border-sky-500/30",
  amber: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  violet: "bg-violet-500/10 text-violet-400 border-violet-500/30",
  muted: "bg-muted text-muted-foreground border-border",
};

export function Pill({ tone = "muted", children, title, className = "" }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function MatchBadge({ type }) {
  const meta = MATCH_META[type] || MATCH_META.negative_billing;
  return (
    <Pill tone={meta.tone} title={meta.hint}>
      {meta.label}
    </Pill>
  );
}

export function ConfidencePill({ value }) {
  if (!value && value !== 0) return null;
  const tone = value >= 80 ? "emerald" : value >= 55 ? "sky" : "amber";
  return <Pill tone={tone} title="How sure the AI is about what it read">{value}% sure</Pill>;
}

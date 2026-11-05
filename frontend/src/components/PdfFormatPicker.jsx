import { useState } from "react";

// Paper sizes for bills and purchases (same names as backend-node/services/pdfFormats.js)
export const PDF_FORMATS = [
  { id: "a4", label: "A4", hint: "Full page", w: 15, h: 21 },
  { id: "a5", label: "A5", hint: "Half page", w: 12, h: 17 },
  { id: "a5_landscape", label: "A5 wide", hint: "Half page, sideways", w: 20, h: 14 },
  { id: "receipt_80", label: "Receipt 80mm", hint: "Thermal printer", w: 10, h: 21 },
  { id: "receipt_58", label: "Receipt 58mm", hint: "Small thermal printer", w: 7, h: 21 },
];

const DEFAULT_FORMAT = "a5_landscape";
const storageKey = (kind) => `dd-${kind}-pdf-format`;

// The last paper chosen, remembered separately for bills and purchases
export function usePdfFormat(kind) {
  const [format, setFormat] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey(kind));
      return PDF_FORMATS.some((f) => f.id === saved) ? saved : DEFAULT_FORMAT;
    } catch {
      return DEFAULT_FORMAT;
    }
  });
  const choose = (id) => {
    setFormat(id);
    try {
      localStorage.setItem(storageKey(kind), id);
    } catch {}
  };
  return [format, choose];
}

export default function PdfFormatPicker({ value, onChange }) {
  const move = (e, index) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    const next = PDF_FORMATS[(index + step + PDF_FORMATS.length) % PDF_FORMATS.length];
    onChange(next.id);
    e.currentTarget.parentElement.querySelector(`[data-format="${next.id}"]`)?.focus();
  };

  return (
    <div>
      <p className="mb-1.5 text-xs font-bold text-foreground">Paper size</p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Paper size">
        {PDF_FORMATS.map((f, i) => {
          const active = value === f.id;
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              data-format={f.id}
              data-testid={`pdf-format-${f.id}`}
              onClick={() => onChange(f.id)}
              onKeyDown={(e) => move(e, i)}
              className={`flex items-center gap-2 rounded-xl border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                active ? "border-orange-500 bg-orange-500/10" : "border-border bg-background hover:border-orange-500/50"
              }`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden="true">
                <span
                  className={`block rounded-[2px] border ${active ? "border-orange-500 bg-orange-500/20" : "border-muted-foreground/60"}`}
                  style={{ width: f.w, height: f.h }}
                />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-bold text-foreground">{f.label}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{f.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

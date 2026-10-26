import { useEffect, useRef, useState } from "react";
import axios from "axios";
import jsQR from "jsqr";
import { toast } from "sonner";
import { Camera, Loader2, Printer, QrCode } from "lucide-react";
import { API } from "../App";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

// Item labels (backend services/itemLabels.js): "DD2:<32 hex>" (compact, current)
// or "DD1|<inventory id>|batch|expiry|mrp|name" (older labels)
const LABEL_RE = /(DD2:[0-9a-f]{32}|DD1\|[A-Za-z0-9-]{8,64}\|.*)$/i;
export const isItemLabel = (v) => /^(DD2:[0-9a-f]{32}$|DD1\|[A-Za-z0-9-]{8,64}\|)/i.test(String(v || "").trim());
// A scanner may type into a field that already has text: the label part and what was there before
export function findItemLabel(v) {
  const s = String(v || "").trim();
  const m = s.match(LABEL_RE);
  return m ? { code: m[0].trim(), before: s.slice(0, m.index).trim() } : null;
}

/** Looks a scanned label up; returns the item or throws with a readable message */
export async function resolveItemLabel(code) {
  try {
    const res = await axios.get(`${API}/inventory/by-code`, { params: { code: String(code).trim() } });
    return res.data;
  } catch (e) {
    throw new Error(e.response?.data?.detail || "Couldn't read this label");
  }
}

const LAYOUTS = [
  ["a4_126", "A4 · Mini 26×15 mm · 126 per page", 126],
  ["a4_65", "A4 · Small 38×21 mm · 65 per page", 65],
  ["a4_44", "A4 · Medium 48×25 mm · 44 per page", 44],
  ["a4_24", "A4 · Large 64×34 mm · 24 per page", 24],
  ["roll_50x25", "Label printer roll · 50×25 mm", 1],
  ["roll_38x25", "Label printer roll · 38×25 mm", 1],
];

/**
 * Print mini QR labels for a purchase's items.
 * lines: purchase.items; only: index of one line (else all).
 */
export function ItemLabelsDialog({ purchase, only = null, onClose }) {
  const items = purchase?.items || [];
  const [rows, setRows] = useState(() =>
    items.map((it, i) => ({
      line: i,
      on: only === null || only === i,
      copies: String(Math.max(1, (Number(it.pack_quantity ?? it.quantity) || 1) + (Number(it.scheme) || 0))),
    }))
  );
  const [layout, setLayout] = useState(() => {
    try {
      return localStorage.getItem("dd-label-layout") || "a4_65";
    } catch {
      return "a4_65";
    }
  });
  const [skip, setSkip] = useState("0");
  const [busy, setBusy] = useState(false);
  const chosen = rows.filter((r) => r.on && Number(r.copies) > 0);
  const total = chosen.reduce((s, r) => s + (parseInt(r.copies, 10) || 0), 0);

  const print = async () => {
    if (!chosen.length) return toast.error("Choose at least one item");
    try {
      localStorage.setItem("dd-label-layout", layout);
    } catch {}
    const win = window.open("", "_blank");
    setBusy(true);
    try {
      const res = await axios.post(
        `${API}/purchases/${purchase.id}/labels`,
        { layout, skip: layout.startsWith("a4_") ? parseInt(skip, 10) || 0 : 0, lines: chosen.map((r) => ({ line: r.line, copies: parseInt(r.copies, 10) || 0 })) },
        { responseType: "blob" }
      );
      const url = URL.createObjectURL(res.data);
      if (win) win.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      onClose();
    } catch (e) {
      win?.close();
      let msg = "Couldn't make the labels";
      try {
        msg = JSON.parse(await e.response.data.text()).detail || msg;
      } catch {}
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg rounded-3xl p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-black">
            <QrCode className="h-5 w-5 text-orange-500" /> Print item QR labels
          </DialogTitle>
          <DialogDescription className="text-xs">
            Stick one on each pack. In Billing, scan it to add the item with its batch, then just enter the quantity.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {rows.map((r) => {
            const it = items[r.line];
            return (
              <label key={r.line} className={`flex items-center gap-2.5 rounded-xl border p-2 ${r.on ? "border-orange-500/40 bg-orange-500/5" : "border-border"}`}>
                <input type="checkbox" checked={r.on} onChange={(e) => setRows((p) => p.map((x) => (x.line === r.line ? { ...x, on: e.target.checked } : x)))} className="h-4 w-4 accent-orange-600" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{it.product_name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    Batch {it.batch_no || "-"} · {it.pack_quantity ?? it.quantity} packs{Number(it.scheme) ? ` + ${it.scheme} free` : ""}
                  </span>
                </span>
                <Input
                  type="number"
                  min="0"
                  max="500"
                  inputMode="numeric"
                  aria-label={`Labels for ${it.product_name}`}
                  value={r.copies}
                  disabled={!r.on}
                  onChange={(e) => setRows((p) => p.map((x) => (x.line === r.line ? { ...x, copies: e.target.value } : x)))}
                  className="h-8 w-16 text-center font-mono font-bold"
                />
              </label>
            );
          })}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
          <div>
            <Label className="text-xs font-bold">Label size</Label>
            <select value={layout} onChange={(e) => setLayout(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">
              {LAYOUTS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          {layout.startsWith("a4_") && (
            <div>
              <Label className="text-xs font-bold" title="Labels already used at the top of the sheet">Skip used</Label>
              <Input type="number" min="0" max={(LAYOUTS.find((x) => x[0] === layout)?.[2] || 65) - 1} value={skip} onChange={(e) => setSkip(e.target.value)} className="mt-1 h-10 w-20 rounded-xl text-center" />
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">Print at 100% scale (“Actual size”), not “Fit to page”.</p>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs font-bold">
            Cancel
          </Button>
          <Button type="button" onClick={print} disabled={busy || !total} className="rounded-xl bg-orange-600 text-xs font-bold text-white hover:bg-orange-700" data-shortcut="save">
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Printer className="mr-1.5 h-4 w-4" />}
            Print {total} label{total === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Camera scanner for item labels; onItem(item) gets the resolved item */
export function ItemQrScanDialog({ open, onClose, onItem }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    let stream = null;
    let stopped = false;
    let raf = null;
    let lastCode = "";
    let inflight = false;
    const detector = "BarcodeDetector" in window ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let frame = 0;

    const handle = async (code) => {
      if (!code || code === lastCode || inflight) return;
      lastCode = code;
      if (!isItemLabel(code)) {
        setError("That QR isn't a DavaDesk item label");
        setTimeout(() => (lastCode = ""), 1200);
        return;
      }
      inflight = true;
      setBusy(true);
      navigator.vibrate?.(40);
      try {
        const item = await resolveItemLabel(code);
        stopped = true;
        onItem(item);
      } catch (e) {
        setError(e.message);
        setTimeout(() => (lastCode = ""), 1500); // same label can be retried
      } finally {
        inflight = false;
        setBusy(false);
      }
    };

    // Draw a region of the video into the canvas at a size the decoders like.
    // Even frames: the guide box at full camera resolution (a small label
    // fills it). Odd frames: the whole picture, for labels held off-centre.
    const grab = (v) => {
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      const crop = frame % 2 === 0;
      const side = Math.round(Math.min(vw, vh) * 0.7);
      const sx = crop ? Math.round((vw - side) / 2) : 0;
      const sy = crop ? Math.round((vh - side) / 2) : 0;
      const sw = crop ? side : vw;
      const sh = crop ? side : vh;
      const target = crop ? Math.min(720, side) : Math.min(800, vw);
      canvas.width = target;
      canvas.height = Math.round((sh / sw) * target);
      ctx.imageSmoothingEnabled = false; // keep module edges crisp
      ctx.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      return canvas;
    };

    const tick = async () => {
      if (stopped) return;
      const v = videoRef.current;
      if (v && v.readyState >= 2 && v.videoWidth && !inflight) {
        try {
          const c = grab(v);
          frame++;
          if (detector) {
            const found = await detector.detect(c);
            if (found[0]?.rawValue) await handle(found[0].rawValue);
          } else {
            const img = ctx.getImageData(0, 0, c.width, c.height);
            const res = jsQR(img.data, c.width, c.height, { inversionAttempts: "dontInvert" });
            if (res?.data) await handle(res.data);
          }
        } catch {}
      }
      // Every frame, no artificial wait
      if (!stopped) raf = requestAnimationFrame(tick);
    };

    setError(null);
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }, audio: false })
      .then((s) => {
        stream = s;
        // Continuous autofocus where the camera supports it (small labels up close)
        const track = s.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() || {};
        if (caps.focusMode?.includes?.("continuous")) track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        const v = videoRef.current;
        if (v) {
          v.srcObject = s;
          v.play().catch(() => {});
        }
        tick();
      })
      .catch((e) => setError(e?.name === "NotAllowedError" ? "Camera access is blocked. Allow it in the browser, or type/scan the code below." : "No camera found. Use a QR scanner in the box below."));
    if (!navigator.mediaDevices?.getUserMedia) setError("This browser can't use the camera here. Use a QR scanner in the box below.");

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line
  }, [open]);

  const submitManual = async (e) => {
    e.preventDefault();
    if (!manual.trim()) return;
    setBusy(true);
    try {
      onItem(await resolveItemLabel(manual));
      setManual("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md rounded-3xl p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-black">
            <Camera className="h-5 w-5 text-orange-500" /> Scan item QR
          </DialogTitle>
          <DialogDescription className="text-xs">Point the camera at the label on the pack. The item is added with its batch; then enter the quantity.</DialogDescription>
        </DialogHeader>
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          {/* Guide box = the region read at full resolution every other frame */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-square h-[70%] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
            </div>
          )}
        </div>
        {error && <p className="rounded-xl bg-rose-500/10 p-2 text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
        <form onSubmit={submitManual} className="flex gap-2">
          <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Or scan with a QR scanner here" aria-label="Item label code" className="h-10 flex-1 rounded-xl font-mono text-xs" />
          <Button type="submit" variant="outline" disabled={busy || !manual.trim()} className="h-10 rounded-xl text-xs font-bold">
            Add
          </Button>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs font-bold">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

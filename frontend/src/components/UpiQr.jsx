import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Download, Loader2, Printer, QrCode, Settings as SettingsIcon } from "lucide-react";
import { API, useAuth } from "../App";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

// Same rules as the server (backend-node/utils/upi.js)
export const UPI_ID_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;
const MAX_AMOUNT = 100000;

export function checkAmount(v) {
  const s = String(v ?? "").replace(/[₹,\s]/g, "");
  if (!s) return "Enter an amount";
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return "Enter a valid amount, up to 2 decimals";
  const n = Number(s);
  if (n < 1) return "Amount must be at least ₹1";
  if (n > MAX_AMOUNT) return "UPI payments are limited to ₹1,00,000 at a time";
  return null;
}

const inr = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function downloadQr(q) {
  const a = document.createElement("a");
  a.href = q.qr || q.image;
  a.download = `upi-qr-${String(q.amount).replace(".", "_")}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Prints the QR on its own page through a hidden iframe
export function printQr(q) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>UPI QR ${esc(inr(q.amount))}</title><style>
    body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;color:#111;margin:40px}
    h1{font-size:22px;margin:0 0 4px}p{margin:4px 0;color:#444}.amt{font-size:34px;font-weight:800;color:#111;margin:14px 0 6px}
    img{width:300px;height:300px;margin:12px auto;display:block}
  </style></head><body>
    <h1>${esc(q.payee_name)}</h1><p>Scan with any UPI app to pay</p>
    <div class="amt">${esc(inr(q.amount))}</div>
    <img src="${q.qr || q.image}" alt="UPI QR"/>
    <p>UPI ID: <b>${esc(q.upi_id)}</b></p>${q.note ? `<p>${esc(q.note)}</p>` : ""}
  </body></html>`;
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(f);
  f.contentDocument.open();
  f.contentDocument.write(html);
  f.contentDocument.close();
  const img = f.contentDocument.querySelector("img");
  const go = () => {
    f.contentWindow.focus();
    f.contentWindow.print();
    setTimeout(() => f.remove(), 1000);
  };
  if (img && !img.complete) img.onload = go;
  else setTimeout(go, 100);
}

// The QR with its details and actions (dialog and chat)
export function UpiQrCard({ q, compact = false }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="rounded-2xl bg-white p-2 shadow-sm ring-1 ring-black/5">
        <img src={q.qr || q.image} alt={`UPI QR to pay ${inr(q.amount)} to ${q.payee_name}`} className={compact ? "h-44 w-44" : "h-56 w-56 sm:h-64 sm:w-64"} />
      </div>
      <p className="mt-3 text-2xl font-black tabular-nums text-foreground">{inr(q.amount)}</p>
      <p className="text-xs font-semibold text-muted-foreground">
        to {q.payee_name} · <span className="font-mono">{q.upi_id}</span>
      </p>
      {q.note && <p className="mt-0.5 text-[11px] text-muted-foreground">{q.note}</p>}
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => downloadQr(q)} className="rounded-xl text-xs font-bold">
          <Download className="mr-1.5 h-3.5 w-3.5" /> Download
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => printQr(q)} className="rounded-xl text-xs font-bold">
          <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
        </Button>
      </div>
    </div>
  );
}

/**
 * Enter an amount, get a scannable UPI QR for the pharmacy's UPI ID.
 * initialAmount / note pre-fill it (e.g. a bill's balance); with
 * autoGenerate the QR shows straight away.
 */
export default function UpiQrDialog({ open, onOpenChange, initialAmount = "", note = "", autoGenerate = false }) {
  const { pharmacy, isAdmin } = useAuth() || {};
  const navigate = useNavigate();
  const [amount, setAmount] = useState("");
  const [q, setQ] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const upiId = String(pharmacy?.upi_id || "").trim();
  const upiOk = UPI_ID_RE.test(upiId);

  const generate = async (value = amount) => {
    const err = checkAmount(value);
    if (err) {
      setError(err);
      inputRef.current?.focus();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API}/pharmacy/upi-qr`, { params: { amount: String(value).replace(/[₹,\s]/g, ""), note: note || undefined } });
      setQ(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Couldn't make the QR. Try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const start = initialAmount !== "" && initialAmount !== null ? String(Math.round(Number(initialAmount) * 100) / 100) : "";
    setAmount(start);
    setQ(null);
    setError(null);
    if (autoGenerate && start && upiOk) generate(start);
    // eslint-disable-next-line
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-black">
            <QrCode className="h-5 w-5 text-orange-500" /> UPI payment QR
          </DialogTitle>
          <DialogDescription className="text-xs">
            {upiOk ? `Customers scan it with any UPI app to pay ${pharmacy?.name || "you"}.` : "A UPI ID is needed to make a QR."}
          </DialogDescription>
        </DialogHeader>

        {!upiOk ? (
          <div className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
            <p className="font-semibold text-foreground">{upiId ? `The saved UPI ID "${upiId}" doesn't look right.` : "No UPI ID is set for your pharmacy yet."}</p>
            <p className="text-xs text-muted-foreground">
              {isAdmin ? "Add it under Settings → Pharmacy → UPI ID (it looks like name@bank)." : "Ask your pharmacy admin to add it in Settings."}
            </p>
            {isAdmin && (
              <Button
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  navigate("/settings");
                }}
                className="rounded-xl text-xs font-bold"
              >
                <SettingsIcon className="mr-1.5 h-3.5 w-3.5" /> Open Settings
              </Button>
            )}
          </div>
        ) : q ? (
          <div className="space-y-3">
            <UpiQrCard q={q} />
            <Button type="button" variant="ghost" size="sm" onClick={() => { setQ(null); setTimeout(() => inputRef.current?.focus(), 0); }} className="w-full rounded-xl text-xs font-bold">
              New amount
            </Button>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              generate();
            }}
          >
            <div>
              <Label htmlFor="upi-qr-amount" className="text-xs font-bold">Amount (₹)</Label>
              <Input
                id="upi-qr-amount"
                ref={inputRef}
                autoFocus
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError(null);
                }}
                placeholder="e.g. 250"
                aria-invalid={!!error}
                className={`mt-1 h-12 rounded-xl text-xl font-black tabular-nums ${error ? "border-rose-500" : ""}`}
              />
              {error && <p className="mt-1 text-xs text-rose-500">{error}</p>}
              <p className="mt-1 text-[11px] text-muted-foreground">Paid to {upiId}</p>
            </div>
            <Button type="submit" disabled={loading} className="h-11 w-full rounded-xl bg-orange-600 font-bold text-white hover:bg-orange-700">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
              Generate QR
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

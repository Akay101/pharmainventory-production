import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { API } from "../App";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

export const WhatsAppIcon = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.04 21.5h-.01a9.45 9.45 0 01-4.82-1.32l-.35-.2-3.58.94.96-3.49-.23-.36a9.43 9.43 0 01-1.45-5.03c0-5.22 4.25-9.47 9.48-9.47 2.53 0 4.9.99 6.7 2.78a9.4 9.4 0 012.77 6.7c0 5.23-4.25 9.47-9.47 9.47zm8.06-17.53A11.33 11.33 0 0012.04.6C5.75.6.63 5.72.63 12.01c0 2.01.53 3.97 1.53 5.7L.53 23.6l6.04-1.58a11.37 11.37 0 005.46 1.39h.01c6.29 0 11.41-5.12 11.41-11.41 0-3.05-1.19-5.92-3.35-8.03z" />
  </svg>
);

// Same rules as the server (backend-node/services/billShare.js):
// an Indian mobile becomes 91XXXXXXXXXX; "+<code>…" keeps its country code
export function normalizeMobile(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  let d = s.replace(/[^\d+]/g, "");
  if (d.startsWith("+") && !d.startsWith("+91")) {
    d = d.slice(1).replace(/\D/g, "");
    return /^[1-9]\d{7,14}$/.test(d) ? d : null;
  }
  d = d.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("091")) d = d.slice(3);
  else if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `91${d}` : null;
}

const waLink = (phone, text) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
const fmtDay = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

/**
 * Send a bill on WhatsApp. share(bill) opens WhatsApp straight away when the
 * bill has a valid mobile; otherwise it asks for a number. Render `dialog`.
 */
export function useWhatsAppShare() {
  const [state, setState] = useState(null); // { bill, phone, message, url, expires_at }
  const [busyId, setBusyId] = useState(null);

  const share = async (bill) => {
    if (!bill?.id || busyId) return;
    // Open the tab inside the click, so pop-up blockers allow it
    const direct = !!normalizeMobile(bill.customer_mobile);
    const win = direct ? window.open("", "_blank") : null;
    setBusyId(bill.id);
    try {
      const { data } = await axios.post(`${API}/bills/${bill.id}/share`, {});
      if (data.wa_url && win) {
        win.opener = null;
        win.location.href = data.wa_url;
        return;
      }
      if (data.wa_url) {
        window.location.href = data.wa_url; // pop-ups blocked: go in this tab
        return;
      }
      win?.close();
      setState({ bill, phone: data.phone_given || "", message: data.message, url: data.url, expires_at: data.expires_at });
    } catch (e) {
      win?.close();
      toast.error(e.response?.data?.detail || "Couldn't prepare the WhatsApp message");
    } finally {
      setBusyId(null);
    }
  };

  const phone = normalizeMobile(state?.phone);
  const typed = String(state?.phone || "").trim();

  const dialog = (
    <Dialog open={!!state} onOpenChange={(o) => !o && setState(null)}>
      <DialogContent className="max-w-md rounded-3xl p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-black">
            <WhatsAppIcon className="h-5 w-5 text-[#25D366]" /> Send bill on WhatsApp
          </DialogTitle>
          <DialogDescription className="text-xs">
            {state?.bill?.bill_no} · {state?.bill?.customer_name || "Walk-in"}
            {!normalizeMobile(state?.bill?.customer_mobile) && (state?.bill?.customer_mobile ? " · the saved number isn't a valid mobile" : " · no mobile on this bill")}
          </DialogDescription>
        </DialogHeader>
        {state && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!phone) return;
              window.open(waLink(phone, state.message), "_blank", "noopener");
              setState(null);
            }}
          >
            <div>
              <Label htmlFor="wa-phone" className="text-xs font-bold">Customer's WhatsApp number</Label>
              <div className="mt-1 flex">
                <span className="inline-flex items-center rounded-l-xl border border-r-0 border-input bg-muted px-3 text-sm font-semibold text-muted-foreground">+91</span>
                <Input
                  id="wa-phone"
                  autoFocus
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={state.phone}
                  onChange={(e) => setState((s) => ({ ...s, phone: e.target.value }))}
                  placeholder="98765 43210"
                  aria-invalid={!!typed && !phone}
                  className={`h-11 rounded-l-none rounded-r-xl text-base font-semibold tracking-wide ${typed && !phone ? "border-rose-500" : ""}`}
                />
              </div>
              <p className={`mt-1 text-[11px] ${typed && !phone ? "text-rose-500" : "text-muted-foreground"}`}>
                {typed && !phone ? "Enter a 10-digit mobile starting with 6–9 (or +country code for numbers abroad)." : "10-digit mobile. For a number outside India type it with + and the country code."}
              </p>
            </div>
            <div>
              <Label htmlFor="wa-message" className="text-xs font-bold">Message</Label>
              <Textarea id="wa-message" value={state.message} onChange={(e) => setState((s) => ({ ...s, message: e.target.value }))} rows={8} className="mt-1 rounded-xl text-xs leading-relaxed" />
              <p className="mt-1 text-[11px] text-muted-foreground">The bill link works without login until {fmtDay(state.expires_at)}.</p>
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(state.message);
                    toast.success("Message copied");
                  } catch {
                    toast.error("Couldn't copy");
                  }
                }}
                className="rounded-xl text-xs font-bold"
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy message
              </Button>
              <Button type="submit" disabled={!phone || !state.message.trim()} className="rounded-xl bg-[#25D366] text-xs font-bold text-white hover:bg-[#1ebe5b]">
                <WhatsAppIcon className="mr-1.5 h-4 w-4" /> Open WhatsApp
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );

  return { share, busyId, dialog };
}

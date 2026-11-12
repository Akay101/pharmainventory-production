// Checkout for an add-on (extra users, a linked pharmacy, or a renewal).
// The server prices it: this shows the quote, takes the GST invoice details
// and sends the owner to Cashfree.
import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import { API, useAuth } from "../../App";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import BillingDetailsFields, { billingError, initialBilling } from "./BillingDetailsFields";
import { formatINR, openGateway } from "../../lib/checkout";

export default function AddonCheckoutDialog({ open, onOpenChange, request, title, description, children }) {
  const { pharmacy } = useAuth();
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);
  const [billing, setBilling] = useState(null);
  const [paying, setPaying] = useState(false);
  const key = JSON.stringify(request || {});

  useEffect(() => {
    if (!open || !request) return;
    let alive = true;
    setQuote(null);
    setError(null);
    axios
      .post(`${API}/billing/addons/quote`, request)
      .then((r) => alive && setQuote(r.data))
      .catch((e) => alive && setError(e.response?.data?.detail || "Couldn't price this"));
    return () => {
      alive = false;
    };
  }, [open, key]); // eslint-disable-line

  useEffect(() => {
    if (!open || billing) return;
    axios
      .get(`${API}/billing/status`)
      .then((r) => setBilling(initialBilling(r.data.billing_profile, { ...pharmacy, gst_no: r.data.pharmacy_gstin })))
      .catch(() => setBilling(initialBilling(null, pharmacy)));
  }, [open]); // eslint-disable-line

  const pay = async () => {
    const problem = billing && billingError(billing);
    if (problem) return toast.error(problem);
    setPaying(true);
    try {
      const res = await axios.post(`${API}/billing/addons/checkout`, { ...request, billing: { ...billing, gstin: billing.gstin || null } });
      await openGateway(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message || "Couldn't start the payment");
      setPaying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !paying && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md rounded-3xl max-h-[92dvh] overflow-y-auto" data-testid="addon-checkout">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {error ? (
          <p className="rounded-xl bg-rose-500/10 px-3 py-2.5 text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>
        ) : !quote ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2.5 text-sm font-semibold">
            {quote.lines.map((l, i) => (
              <div key={i} className="flex justify-between gap-3">
                <span className="text-muted-foreground">
                  {l.description}
                  {l.qty > 1 ? ` × ${l.qty}` : ""}
                </span>
                <span>{formatINR(l.taxable_paise)}</span>
              </div>
            ))}
            <div className="flex justify-between text-muted-foreground">
              <span>GST ({quote.gst_percent}%)</span>
              <span>{formatINR(quote.gst_paise)}</span>
            </div>
            <div className="border-t border-border pt-3 flex justify-between text-base font-extrabold">
              <span>Total</span>
              <span data-testid="addon-total">{formatINR(quote.amount_paise)}</span>
            </div>
          </div>
        )}
        {billing && quote && <BillingDetailsFields value={billing} onChange={setBilling} />}
        <DialogFooter>
          <Button
            onClick={pay}
            disabled={!quote || paying}
            className="w-full h-12 rounded-xl font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
            data-testid="addon-pay-btn"
          >
            {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Lock className="w-4 h-4 mr-2" /> Pay {quote ? formatINR(quote.amount_paise) : ""} securely</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, ArrowRight, ChevronDown, Loader2, Save, User } from "lucide-react";
import { toast } from "sonner";
import { API, useAuth } from "../App";
import BillingScanWorkspace from "../components/scan/BillingScanWorkspace";
import { AiAmbient, AiMark } from "../components/scan/ScanUI";

const todayIst = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

// Mobile counter scanner: snap each pack, it's read and matched to stock, then
// save as a draft bill or open it in the billing screen.
export default function BillingScannerPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [billingDate, setBillingDate] = useState(todayIst());
  const [customer, setCustomer] = useState({ customer_id: null, customer_name: "Walk-in Customer", customer_mobile: "", customer_email: "" });
  const [doctorName, setDoctorName] = useState("");
  const [isPaid, setIsPaid] = useState(true);
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [lines, setLines] = useState([]);
  const [saving, setSaving] = useState(false);

  // Customer lookup against the server (not just the first page)
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchSeq = useRef(0);
  useEffect(() => {
    const q = customer.customer_id ? "" : customer.customer_name.trim();
    if (!showSuggestions || q.length < 2 || q === "Walk-in Customer") {
      setSuggestions([]);
      return;
    }
    const seq = ++searchSeq.current;
    const t = setTimeout(async () => {
      try {
        const res = await axios.get(`${API}/customers`, { params: { search: q, limit: 8 } });
        if (seq === searchSeq.current) setSuggestions(res.data.customers || []);
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [customer.customer_name, customer.customer_id, showSuggestions]);

  const total = lines.reduce((s, l) => s + (Number(l.mrp) || 0) * (Number(l.quantity) || 0), 0);
  const negatives = lines.filter((l) => !l.inventory_id).length;

  const saveDraft = async () => {
    if (!lines.length) return toast.error("Scan at least one product first");
    if (!customer.customer_name.trim()) {
      setDetailsOpen(true);
      return toast.error("Customer name is required");
    }
    setSaving(true);
    try {
      const res = await axios.post(`${API}/bills/drafts`, {
        customer_id: customer.customer_id || null,
        customer_name: customer.customer_name.trim(),
        customer_mobile: customer.customer_mobile.trim(),
        customer_email: customer.customer_email.trim(),
        billing_date: billingDate,
        doctor: doctorName.trim(),
        is_paid: isPaid,
        payment_mode: isPaid ? paymentMode : "none",
        items: lines.map((l) => ({
          inventory_id: l.inventory_id || null,
          product_name: l.product_name,
          salt_composition: l.salt_composition,
          batch_no: l.batch_no,
          expiry_date: l.expiry_date,
          available: l.available_quantity,
          available_quantity: l.available_quantity,
          quantity: l.quantity,
          unit_price: l.mrp,
          mrp: l.mrp,
          purchase_price: l.purchase_price,
          discount_percent: 0,
          cgst: l.cgst,
          sgst: l.sgst,
          units_per_pack: l.units_per_pack,
        })),
      });
      const draft = res.data?.draft || res.data;
      toast.success(`Draft bill ${draft?.draft_no ? `#${draft.draft_no} ` : ""}saved`);
      navigate("/billing?tab=drafts", { state: { activeTab: "drafts" } });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't save the draft bill");
    } finally {
      setSaving(false);
    }
  };

  const openInBilling = () => {
    if (!lines.length) return toast.error("Scan at least one product first");
    navigate("/billing", {
      state: {
        scannedItems: lines,
        customerDetails: { ...customer, doctor: doctorName, billing_date: billingDate, is_paid: isPaid, payment_mode: paymentMode },
      },
    });
  };

  if (!user) return null;

  return (
    <div className="relative isolate min-h-screen bg-background text-foreground pb-32">
      <AiAmbient />

      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <button type="button" onClick={() => navigate("/billing")} className="h-9 w-9 rounded-xl hover:bg-muted flex items-center justify-center" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <AiMark className="h-9 w-9" />
          <div className="min-w-0">
            <h1 className="text-base font-bold leading-tight">Scan to bill</h1>
            <p className="text-[11px] text-muted-foreground truncate">Batch first, then name, matched to your stock</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 px-4 py-4">
        {/* Customer & bill details, collapsed by default to keep the camera first */}
        <section className="rounded-2xl border border-border bg-card shadow-sm">
          <button type="button" onClick={() => setDetailsOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
            <div className="h-9 w-9 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center">
              <User className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{customer.customer_name || "Customer"}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {[customer.customer_mobile, doctorName && `Dr. ${doctorName.replace(/^dr\.?\s*/i, "")}`, isPaid ? `Paid · ${paymentMode}` : "Credit"].filter(Boolean).join(" · ")}
              </p>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
          </button>
          {detailsOpen && (
            <div className="grid grid-cols-1 gap-3 border-t border-border px-4 py-4 sm:grid-cols-2 ai-pop-in">
              <div className="relative sm:col-span-2">
                <label className="text-[11px] font-semibold text-muted-foreground">Customer name *</label>
                <input
                  value={customer.customer_name}
                  onFocus={(e) => {
                    setShowSuggestions(true);
                    if (customer.customer_name === "Walk-in Customer") e.target.select();
                  }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  onChange={(e) => setCustomer((c) => ({ ...c, customer_name: e.target.value, customer_id: null }))}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xl">
                    {suggestions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setCustomer({ customer_id: c.id, customer_name: c.name || "", customer_mobile: c.mobile || "", customer_email: c.email || "" });
                          setShowSuggestions(false);
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <span className="font-medium truncate">{c.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">{c.mobile}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">Mobile</label>
                <input
                  inputMode="tel"
                  value={customer.customer_mobile}
                  onChange={(e) => setCustomer((c) => ({ ...c, customer_mobile: e.target.value }))}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">Doctor</label>
                <input value={doctorName} onChange={(e) => setDoctorName(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">Bill date</label>
                <input type="date" value={billingDate} onChange={(e) => setBillingDate(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground">Payment</label>
                <div className="mt-1 flex h-10 rounded-xl border border-border bg-background p-1 text-xs font-semibold">
                  {["Cash", "UPI", "Card", "Credit"].map((m) => {
                    const active = m === "Credit" ? !isPaid : isPaid && paymentMode === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          if (m === "Credit") setIsPaid(false);
                          else {
                            setIsPaid(true);
                            setPaymentMode(m);
                          }
                        }}
                        className={`flex-1 rounded-lg transition ${active ? "bg-orange-500 text-white" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>

        <BillingScanWorkspace onLinesChange={setLines} />
      </main>

      {/* Sticky summary + actions, thumb-reachable on phones */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold leading-tight">₹{total.toFixed(2)}</p>
            <p className="text-[11px] text-muted-foreground">
              {lines.length} item{lines.length === 1 ? "" : "s"}
              {negatives > 0 && <span className="text-amber-500"> · {negatives} not in stock</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={saveDraft}
            disabled={!lines.length || saving}
            className="h-11 px-3 sm:px-4 rounded-xl border border-border bg-card text-sm font-semibold flex items-center gap-1.5 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span>Draft</span>
          </button>
          <button
            type="button"
            onClick={openInBilling}
            disabled={!lines.length}
            className="h-11 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 text-white text-sm font-semibold flex items-center gap-1.5 shadow-lg shadow-orange-500/20 disabled:opacity-40 active:scale-[0.99]"
          >
            Open bill <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

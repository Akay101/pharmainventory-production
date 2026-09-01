import React, { memo } from "react";
import { ShoppingCart, CheckCircle2, DollarSign, Package, AlertCircle, Plus, Sparkles, Loader2, Check } from "lucide-react";
import { Button } from "../ui/button";

const DraftPurchaseCard = memo(({ draftState, onConfirm, onQuickAction, isExecuting }) => {
  if (!draftState) return null;

  const { supplier_name, invoice_no, purchase_date, items = [], total_amount = 0, payment_status, payment_mode, ready_to_create, recorded } = draftState;

  const cleanInvoiceNo = invoice_no && !invoice_no.includes("-") ? invoice_no : (invoice_no || "—");

  return (
    <div className="w-full my-3 rounded-2xl border border-orange-500/30 bg-card shadow-xl overflow-hidden text-foreground ring-1 ring-orange-500/20">
      {/* Header with AI Gradient */}
      <div className="px-4 py-3 bg-gradient-to-r from-orange-500/15 via-amber-500/10 to-orange-500/5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
            <ShoppingCart className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-extrabold text-orange-600 dark:text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
              Draft Purchase
              <Sparkles className="w-3 h-3 text-amber-500" />
            </h4>
            <p className="text-[10px] text-muted-foreground font-medium">{supplier_name || "Supplier pending..."}</p>
          </div>
        </div>

        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
          recorded
            ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40"
            : ready_to_create
            ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
            : "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
        }`}>
          {recorded ? "Recorded" : ready_to_create ? "Ready to Record" : "Drafting..."}
        </span>
      </div>

      {/* Details Meta Grid */}
      <div className="p-3 grid grid-cols-2 gap-2 text-xs border-b border-border bg-muted/20">
        <div>
          <span className="text-[10px] text-muted-foreground block">Supplier</span>
          <span className="font-semibold text-foreground truncate block">{supplier_name || "Not selected"}</span>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground block">Invoice No</span>
          <span className="font-mono text-foreground block">{cleanInvoiceNo}</span>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground block">Payment Status</span>
          <span className="font-medium text-orange-600 dark:text-orange-400 block">{payment_status || "Unpaid"} {payment_mode ? `(${payment_mode})` : ""}</span>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground block">Purchase Date</span>
          <span className="font-mono text-foreground block">
            {purchase_date && !isNaN(new Date(purchase_date).getTime())
              ? new Date(purchase_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
              : purchase_date || "Today"}
          </span>
        </div>
      </div>

      {/* Items Table */}
      <div className="p-3">
        <h5 className="text-[11px] font-bold text-muted-foreground mb-2 flex items-center gap-1">
          <Package className="w-3.5 h-3.5 text-orange-500" />
          Items ({items.length})
        </h5>

        {items.length === 0 ? (
          <div className="p-3 border border-dashed border-border rounded-xl text-center text-xs text-muted-foreground italic">
            No items added yet. Tell the agent which medicines to add!
          </div>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/40 border border-border/60 text-xs">
                <div className="flex flex-col max-w-[70%] gap-0.5">
                  <span className="font-bold text-foreground truncate">{item.product_name}</span>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap mt-1">
                    <span className="font-medium bg-card px-1.5 py-0.5 rounded border border-border">{item.pack_quantity || 1} {item.pack_type || "Strip"} ({item.units_per_pack || 10} Tab/Strip) @ ₹{item.pack_price || 0}</span>
                    {item.mrp_pack > 0 && <span className="text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-bold border border-amber-500/20">MRP ₹{item.mrp_pack}</span>}
                    {item.batch_no && <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[9px] border border-border">Batch: {item.batch_no}</span>}
                    {item.expiry_date && <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[9px]">Exp: {item.expiry_date}</span>}
                    {item.discount > 0 && <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-bold border border-emerald-500/20">{item.discount}% OFF</span>}
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-bold text-orange-600 dark:text-orange-400 font-mono text-xs">
                    ₹{(item.item_total || ((item.pack_quantity || 1) * (item.pack_price || 0))).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Total & Actions */}
      <div className="p-3 bg-muted/30 border-t border-border flex items-center justify-between">
        <div>
          <span className="text-[10px] text-muted-foreground block">Estimated Total</span>
          <span className="text-base font-black text-orange-600 dark:text-orange-400 font-mono">₹{total_amount.toFixed(2)}</span>
        </div>

        <div className="flex items-center gap-2">
          {recorded ? (
            <Button
              size="sm"
              disabled
              className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/40 font-bold gap-1.5 h-8 text-xs rounded-xl cursor-default"
            >
              <Check className="w-3.5 h-3.5" />
              Recorded
            </Button>
          ) : ready_to_create ? (
            <Button
              size="sm"
              disabled={isExecuting}
              onClick={onConfirm}
              className="bg-orange-600 hover:bg-orange-700 text-white font-black shadow-md shadow-orange-600/20 gap-1.5 h-8 text-xs rounded-xl transition-all cursor-pointer"
            >
              {isExecuting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Recording...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Confirm Purchase
                </>
              )}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
});

export default DraftPurchaseCard;

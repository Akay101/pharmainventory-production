import React, { memo } from "react";
import { ShoppingCart, CheckCircle2, DollarSign, Package, AlertCircle, Plus, Sparkles, Loader2, Check } from "lucide-react";
import { Button } from "../ui/button";

const DraftPurchaseCard = memo(({ draftState, onConfirm, onQuickAction, isExecuting }) => {
  if (!draftState) return null;

  const { supplier_name, invoice_no, purchase_date, items = [], total_amount = 0, payment_status, payment_mode, ready_to_create, recorded } = draftState;

  const cleanInvoiceNo = invoice_no && !invoice_no.includes("-") ? invoice_no : (invoice_no || "—");

  return (
    <div className="w-full my-3 rounded-2xl border border-indigo-500/30 bg-gradient-to-b from-[#0f172a] to-[#0b0f19] shadow-xl overflow-hidden text-slate-100 ring-1 ring-indigo-500/20">
      {/* Header with AI Gradient */}
      <div className="px-4 py-3 bg-gradient-to-r from-indigo-600/20 via-purple-600/20 to-teal-500/20 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/30">
            <ShoppingCart className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
              Draft Purchase Order
              <Sparkles className="w-3 h-3 text-yellow-400" />
            </h4>
            <p className="text-[10px] text-slate-400 font-medium">{supplier_name || "Supplier pending..."}</p>
          </div>
        </div>

        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
          recorded
            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
            : ready_to_create
            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
            : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
        }`}>
          {recorded ? "✓ Recorded" : ready_to_create ? "Ready to Record" : "Drafting..."}
        </span>
      </div>

      {/* Details Meta Grid */}
      <div className="p-3 grid grid-cols-2 gap-2 text-xs border-b border-slate-800/80 bg-[#0b0f19]">
        <div>
          <span className="text-[10px] text-slate-400 block">Supplier</span>
          <span className="font-semibold text-slate-200 truncate block">{supplier_name || "Not selected"}</span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 block">Invoice No</span>
          <span className="font-mono text-slate-200 block">{cleanInvoiceNo}</span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 block">Payment Status</span>
          <span className="font-medium text-indigo-400 block">{payment_status || "Unpaid"} {payment_mode ? `(${payment_mode})` : ""}</span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 block">Purchase Date</span>
          <span className="font-mono text-slate-200 block">{purchase_date || "Today"}</span>
        </div>
      </div>

      {/* Items Table */}
      <div className="p-3">
        <h5 className="text-[11px] font-bold text-slate-400 mb-2 flex items-center gap-1">
          <Package className="w-3.5 h-3.5 text-indigo-400" />
          Items ({items.length})
        </h5>

        {items.length === 0 ? (
          <div className="p-3 border border-dashed border-slate-800 rounded-xl text-center text-xs text-slate-500 italic">
            No items added yet. Tell the agent which medicines to add!
          </div>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-[#1e293b]/80 border border-slate-800 text-xs">
                <div className="flex flex-col max-w-[65%]">
                  <span className="font-bold text-slate-200 truncate">{item.product_name}</span>
                  <span className="text-[10px] text-slate-400">
                    {item.pack_quantity} {item.pack_type || "Strip"} × ₹{item.pack_price || 0}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-indigo-400 font-mono">₹{((item.pack_quantity || 1) * (item.pack_price || 0)).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Total & Actions */}
      <div className="p-3 bg-[#1e293b] border-t border-slate-800 flex items-center justify-between">
        <div>
          <span className="text-[10px] text-slate-400 block">Estimated Total</span>
          <span className="text-base font-extrabold text-indigo-400 font-mono">₹{total_amount.toFixed(2)}</span>
        </div>

        <div className="flex items-center gap-2">
          {recorded ? (
            <Button
              size="sm"
              disabled
              className="bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-bold gap-1.5 h-8 text-xs rounded-xl cursor-default"
            >
              <Check className="w-3.5 h-3.5" />
              Recorded
            </Button>
          ) : ready_to_create ? (
            <Button
              size="sm"
              disabled={isExecuting}
              onClick={onConfirm}
              className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:opacity-95 text-white font-bold shadow-lg shadow-emerald-900/30 gap-1.5 h-8 text-xs rounded-xl transition-all"
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

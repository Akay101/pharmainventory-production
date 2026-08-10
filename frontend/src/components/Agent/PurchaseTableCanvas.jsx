import React, { useState, memo } from "react";
import {
  FileSpreadsheet,
  Calendar,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Search,
  ArrowUpDown,
  ExternalLink,
  PackageCheck,
  DollarSign,
  Sparkles,
} from "lucide-react";

const PurchaseTableCanvas = memo(({ purchasesData }) => {
  if (!purchasesData || !purchasesData.purchases) return null;

  const { purchases = [], summary = {} } = purchasesData;
  const [expandedId, setExpandedId] = useState(null);
  const [filterText, setFilterText] = useState("");

  const filteredPurchases = purchases.filter((p) => {
    if (!filterText) return true;
    const search = filterText.toLowerCase();
    return (
      (p.supplier_name && p.supplier_name.toLowerCase().includes(search)) ||
      (p.invoice_no && p.invoice_no.toLowerCase().includes(search)) ||
      (p.items &&
        p.items.some(
          (i) => i.product_name && i.product_name.toLowerCase().includes(search)
        ))
    );
  });

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="w-full my-4 rounded-2xl border border-indigo-500/30 bg-gradient-to-b from-[#111827] to-[#0f172a] text-slate-100 shadow-2xl overflow-hidden ring-1 ring-indigo-500/20">
      {/* Canvas Summary Header Bar with AI Gradients */}
      <div className="p-4 bg-gradient-to-r from-[#1e293b] via-[#111827] to-[#1e293b] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-slate-100 flex items-center gap-2">
              Purchases Canvas
              <span className="text-[10px] bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30 font-mono font-bold">
                {purchases.length} Orders
              </span>
            </h4>
            <p className="text-[11px] text-slate-400">
              Interactive detailed purchase ledger & item analytics
            </p>
          </div>
        </div>

        {/* Summary Metric Badges */}
        <div className="flex items-center gap-3 text-xs">
          <div className="px-3 py-1.5 rounded-xl bg-[#0b0f19] border border-slate-800 flex items-center gap-2 shadow-inner">
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            <div>
              <span className="text-[10px] text-slate-400 block leading-none">
                Total Spend
              </span>
              <span className="font-extrabold text-emerald-400 font-mono">
                ₹{(summary.total_spend || 0).toFixed(2)}
              </span>
            </div>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-[#0b0f19] border border-slate-800 flex items-center gap-2 shadow-inner">
            <PackageCheck className="w-3.5 h-3.5 text-indigo-400" />
            <div>
              <span className="text-[10px] text-slate-400 block leading-none">
                Orders
              </span>
              <span className="font-bold text-slate-200 font-mono">
                {summary.total_orders || purchases.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="px-4 py-2.5 bg-[#0b0f19] border-b border-slate-800/80 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Filter by supplier, invoice, or medicine..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-[#1e293b] border border-slate-700/60 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <span className="text-[11px] text-slate-400">
          Showing{" "}
          <strong className="text-indigo-400 font-mono">
            {filteredPurchases.length}
          </strong>{" "}
          of {purchases.length}
        </span>
      </div>

      {/* Detailed Data Table */}
      <div className="overflow-x-auto max-h-[420px] scrollbar-thin">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-[#1e293b] border-b border-slate-800 text-slate-400 font-semibold sticky top-0 z-10">
            <tr>
              <th className="p-3 w-8"></th>
              <th className="p-3">Date</th>
              <th className="p-3">Invoice No</th>
              <th className="p-3">Supplier Name</th>
              <th className="p-3">Items Summary</th>
              <th className="p-3">Payment Status</th>
              <th className="p-3 text-right">Total Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {filteredPurchases.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="p-8 text-center text-slate-500 italic"
                >
                  No purchases match your filter query.
                </td>
              </tr>
            ) : (
              filteredPurchases.map((p, pIdx) => {
                const isExpanded = expandedId === (p.id || pIdx);
                const itemsCount = p.items ? p.items.length : 0;
                const itemsSummaryText = p.items
                  ? p.items.map((i) => i.product_name).join(", ")
                  : "—";
                const dateStr = p.purchase_date
                  ? new Date(p.purchase_date).toLocaleDateString()
                  : "—";
                const cleanInvoiceNo =
                  p.invoice_no && !p.invoice_no.includes("-")
                    ? p.invoice_no
                    : p.invoice_no || "N/A";

                return (
                  <React.Fragment key={p.id || pIdx}>
                    <tr
                      onClick={() => toggleExpand(p.id || pIdx)}
                      className={`hover:bg-[#1e293b]/60 transition-colors cursor-pointer ${isExpanded ? "bg-[#1e293b]/80" : ""}`}
                    >
                      <td className="p-3 text-slate-400">
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-indigo-400" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </td>
                      <td className="p-3 font-sans text-slate-300 font-medium">
                        {dateStr}
                      </td>
                      <td className="p-3 font-bold text-slate-300">
                        {cleanInvoiceNo}
                      </td>
                      <td className="p-3 font-sans text-indigo-300 font-semibold">
                        {p.supplier_name || "Unknown Supplier"}
                      </td>
                      <td
                        className="p-3 font-sans text-slate-400 max-w-[200px] truncate"
                        title={itemsSummaryText}
                      >
                        <span className="bg-slate-800 text-slate-300 text-[10px] px-1.5 py-0.5 rounded font-mono mr-1.5">
                          {itemsCount} pkts
                        </span>
                        {itemsSummaryText}
                      </td>
                      <td className="p-3 font-sans">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            p.payment_status === "Paid"
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : p.payment_status === "Partial"
                                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                          }`}
                        >
                          {p.payment_status || "Unpaid"}
                        </span>
                      </td>
                      <td className="p-3 text-right font-extrabold text-indigo-400 text-sm">
                        ₹{(p.total_amount || 0).toFixed(2)}
                      </td>
                    </tr>

                    {/* Expandable Rows Details (UUID SANITIZED) */}
                    {isExpanded && (
                      <tr className="bg-[#0b0f19]">
                        <td
                          colSpan={7}
                          className="p-4 border-b border-indigo-500/20"
                        >
                          <div className="bg-[#111827] rounded-xl p-3 border border-slate-800 shadow-inner">
                            <h5 className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 font-sans">
                              Item Breakdowns for Invoice {cleanInvoiceNo}
                            </h5>

                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-[#1e293b] border-b border-slate-800 text-slate-400 font-semibold">
                                  <tr>
                                    <th className="p-2">Medicine Product</th>
                                    <th className="p-2">Batch No</th>
                                    <th className="p-2">Expiry</th>
                                    <th className="p-2">Packs (Qty)</th>
                                    <th className="p-2">Rate/Pack</th>
                                    <th className="p-2">MRP/Pack</th>
                                    <th className="p-2">Taxes (CGST+SGST)</th>
                                    <th className="p-2 text-right">
                                      Item Total
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/40 text-slate-300">
                                  {(p.items || []).map((item, idx) => (
                                    <tr
                                      key={idx}
                                      className="hover:bg-[#1e293b]/40"
                                    >
                                      <td className="p-2 font-bold font-sans text-indigo-300">
                                        {item.product_name}
                                      </td>
                                      <td className="p-2 text-slate-400">
                                        {item.batch_no || "—"}
                                      </td>
                                      <td className="p-2 text-slate-400">
                                        {item.expiry_date || "—"}
                                      </td>
                                      <td className="p-2">
                                        {item.pack_quantity ||
                                          item.quantity ||
                                          1}{" "}
                                        {item.pack_type || "Strip"}
                                      </td>
                                      <td className="p-2">
                                        ₹
                                        {(
                                          item.pack_price ||
                                          item.purchase_price ||
                                          0
                                        ).toFixed(2)}
                                      </td>
                                      <td className="p-2 text-slate-400">
                                        ₹
                                        {(
                                          item.mrp_pack ||
                                          item.mrp ||
                                          0
                                        ).toFixed(2)}
                                      </td>
                                      <td className="p-2 text-slate-400">
                                        {(item.cgst || 0) + (item.sgst || 0)}%
                                      </td>
                                      <td className="p-2 text-right font-bold text-emerald-400">
                                        ₹
                                        {(
                                          item.item_total ||
                                          (item.pack_quantity || 1) *
                                            (item.pack_price || 0)
                                        ).toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default PurchaseTableCanvas;

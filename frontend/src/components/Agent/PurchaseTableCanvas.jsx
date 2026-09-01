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
  IndianRupee,
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
    <div className="w-full my-4 rounded-2xl border border-orange-500/30 bg-card text-foreground shadow-2xl overflow-hidden ring-1 ring-orange-500/20">
      {/* Canvas Summary Header Bar with AI Gradients */}
      <div className="p-4 bg-gradient-to-r from-orange-500/15 via-amber-500/10 to-orange-500/5 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20 shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
              Your Purchases
              <span className="text-[10px] bg-orange-500/10 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full border border-orange-500/30 font-mono font-bold">
                {purchases.length} Orders
              </span>
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Interactive detailed purchase ledger & item analytics
            </p>
          </div>
        </div>

        {/* Summary Metric Badges */}
        <div className="flex items-center gap-3 text-xs">
          <div className="px-3 py-1.5 rounded-xl bg-muted/40 border border-border flex items-center gap-2 shadow-inner">
            <IndianRupee className="w-3.5 h-3.5 text-emerald-500" />
            <div>
              <span className="text-[10px] text-muted-foreground block leading-none">
                Total Spend
              </span>
              <span className="font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                ₹{(summary.total_spend || 0).toFixed(2)}
              </span>
            </div>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-muted/40 border border-border flex items-center gap-2 shadow-inner">
            <PackageCheck className="w-3.5 h-3.5 text-orange-500" />
            <div>
              <span className="text-[10px] text-muted-foreground block leading-none">
                Orders
              </span>
              <span className="font-bold text-foreground font-mono">
                {summary.total_orders || purchases.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="px-4 py-2.5 bg-muted/20 border-b border-border flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter by supplier, invoice, or medicine..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-background border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-orange-500"
          />
        </div>
        <span className="text-[11px] text-muted-foreground">
          Showing{" "}
          <strong className="text-orange-600 dark:text-orange-400 font-mono">
            {filteredPurchases.length}
          </strong>{" "}
          of {purchases.length}
        </span>
      </div>

      {/* Detailed Data Table */}
      <div className="overflow-x-auto max-h-[420px] scrollbar-thin">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-muted/50 border-b border-border text-muted-foreground font-semibold sticky top-0 z-10">
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
          <tbody className="divide-y divide-border/60 font-mono">
            {filteredPurchases.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="p-8 text-center text-muted-foreground italic"
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
                      className={`hover:bg-muted/30 transition-colors cursor-pointer ${isExpanded ? "bg-muted/50" : ""}`}
                    >
                      <td className="p-3 text-muted-foreground">
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-orange-500" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </td>
                      <td className="p-3 font-sans text-foreground font-medium">
                        {dateStr}
                      </td>
                      <td className="p-3 font-bold text-foreground">
                        {cleanInvoiceNo}
                      </td>
                      <td className="p-3 font-sans text-orange-600 dark:text-orange-400 font-semibold">
                        {p.supplier_name || "Unknown Supplier"}
                      </td>
                      <td
                        className="p-3 font-sans text-muted-foreground max-w-[200px] truncate"
                        title={itemsSummaryText}
                      >
                        <span className="bg-muted text-foreground text-[10px] px-1.5 py-0.5 rounded font-mono mr-1.5">
                          {itemsCount} pkts
                        </span>
                        {itemsSummaryText}
                      </td>
                      <td className="p-3 font-sans">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            p.payment_status === "Paid"
                              ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                              : p.payment_status === "Partial"
                                ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                                : "bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                          }`}
                        >
                          {p.payment_status || "Unpaid"}
                        </span>
                      </td>
                      <td className="p-3 text-right font-extrabold text-orange-600 dark:text-orange-400 text-sm">
                        ₹{(p.total_amount || 0).toFixed(2)}
                      </td>
                    </tr>

                    {/* Expandable Rows Details */}
                    {isExpanded && (
                      <tr className="bg-muted/10">
                        <td
                          colSpan={7}
                          className="p-4 border-b border-orange-500/20"
                        >
                          <div className="bg-card rounded-xl p-3 border border-border shadow-inner">
                            <h5 className="text-[11px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 font-sans">
                              Item Breakdowns for Invoice {cleanInvoiceNo}
                            </h5>

                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-muted/40 border-b border-border text-muted-foreground font-semibold">
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
                                <tbody className="divide-y divide-border/40 text-foreground">
                                  {(p.items || []).map((item, idx) => (
                                    <tr
                                      key={idx}
                                      className="hover:bg-muted/20"
                                    >
                                      <td className="p-2 font-bold font-sans text-orange-600 dark:text-orange-400">
                                        {item.product_name}
                                      </td>
                                      <td className="p-2 text-muted-foreground">
                                        {item.batch_no || "—"}
                                      </td>
                                      <td className="p-2 text-muted-foreground">
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
                                      <td className="p-2 text-muted-foreground">
                                        ₹
                                        {(
                                          item.mrp_pack ||
                                          item.mrp ||
                                          0
                                        ).toFixed(2)}
                                      </td>
                                      <td className="p-2 text-muted-foreground">
                                        {(item.cgst || 0) + (item.sgst || 0)}%
                                      </td>
                                      <td className="p-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
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

import React, { useState } from "react";
import { X, Search, Plus, Minus, Check, ShoppingBag, Pill } from "lucide-react";
import { Button } from "../ui/button";

const POPULAR_MEDICINES = [
  { name: "Dolo 650 mg Tablet", category: "Analgesic & Antipyretic", pack_price: 30 },
  { name: "Crocin Advance", category: "Pain Relief", pack_price: 25 },
  { name: "Pantocid D SR", category: "Gastrointestinal", pack_price: 140 },
  { name: "Augmentin 625 Duo", category: "Antibiotic", pack_price: 200 },
  { name: "Azithral 500 mg", category: "Antibiotic", pack_price: 110 },
  { name: "Montair LC", category: "Anti-allergic", pack_price: 180 },
];

export default function PurchaseFollowupModal({ isOpen, onClose, onSubmit, questionText }) {
  if (!isOpen) return null;

  const [search, setSearch] = useState("");
  const [selectedMed, setSelectedMed] = useState(POPULAR_MEDICINES[0]);
  const [supplierName, setSupplierName] = useState("Apollo Pharma");
  const [quantity, setQuantity] = useState(10);

  const filteredMeds = POPULAR_MEDICINES.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedMed) return;

    const followUpPayload = {
      product_name: selectedMed.name,
      quantity,
      supplier_name: supplierName,
      pack_price: selectedMed.pack_price,
    };

    onSubmit(followUpPayload);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card text-foreground shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-orange-600 dark:text-orange-400 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-orange-500" />
              Follow-up Details
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">
              {questionText || "Please specify the medicine product, supplier, and quantity:"}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Medicine Search */}
          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
              Select Medicine Product
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          {/* Product Cards Grid */}
          <div className="grid grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
            {filteredMeds.map((med, idx) => {
              const isSelected = selectedMed?.name === med.name;
              return (
                <div
                  key={idx}
                  onClick={() => setSelectedMed(med)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                    isSelected
                      ? "bg-orange-500/15 border-orange-500 text-orange-600 dark:text-orange-400 shadow-sm font-bold"
                      : "bg-muted/30 border-border/70 text-foreground hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                      <Pill className="w-3.5 h-3.5 text-orange-500" />
                    </div>
                    <div className="overflow-hidden">
                      <h4 className="font-bold text-xs truncate">{med.name}</h4>
                      <p className="text-[10px] text-muted-foreground truncate">{med.category}</p>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-white shrink-0">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Supplier & Quantity Input Controls */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Supplier
              </label>
              <select
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="w-full p-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:border-orange-500"
              >
                <option value="Apollo Pharma">Apollo Pharma</option>
                <option value="MedPlus Wholesalers">MedPlus Wholesalers</option>
                <option value="ABC Pharmaceuticals">ABC Pharmaceuticals</option>
                <option value="Sun Pharma Distributors">Sun Pharma Distributors</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Pack Quantity
              </label>
              <div className="flex items-center bg-background border border-border rounded-xl p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="h-7 w-7 text-foreground hover:bg-muted rounded-lg"
                >
                  <Minus className="w-3.5 h-3.5" />
                </Button>
                <span className="flex-1 text-center font-bold text-xs font-mono">{quantity}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setQuantity(quantity + 1)}
                  className="h-7 w-7 text-orange-500 hover:bg-orange-500/10 rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Submit Footer */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
              Skip
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-orange-600 hover:bg-orange-700 text-white font-black text-xs rounded-xl px-4 shadow-md shadow-orange-600/20 cursor-pointer"
            >
              Submit Details
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

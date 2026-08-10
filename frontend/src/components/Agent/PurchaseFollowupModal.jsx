import React, { useState } from "react";
import { X, Search, Plus, Minus, Check, ShoppingBag, Layers } from "lucide-react";
import { Button } from "../ui/button";

const POPULAR_MEDICINES = [
  { name: "Dolo 650 mg Tablet", category: "Analgesic & Antipyretic", pack_price: 30, icon: "💊" },
  { name: "Crocin Advance", category: "Pain Relief", pack_price: 25, icon: "💊" },
  { name: "Pantocid D SR", category: "Gastrointestinal", pack_price: 140, icon: "🩺" },
  { name: "Augmentin 625 Duo", category: "Antibiotic", pack_price: 200, icon: "🩺" },
  { name: "Azithral 500 mg", category: "Antibiotic", pack_price: 110, icon: "💊" },
  { name: "Montair LC", category: "Anti-allergic", pack_price: 180, icon: "🩺" },
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
      <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-[#111827] text-slate-100 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-[#1e293b] flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-indigo-400 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              Follow-up Details
            </h3>
            <p className="text-xs text-slate-300 mt-0.5 font-medium">
              {questionText || "Please specify the medicine product, supplier, and quantity:"}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Medicine Search */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Select Medicine Product
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-[#1e293b] border border-slate-700 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
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
                      ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-md"
                      : "bg-[#1e293b]/60 border-slate-800/80 text-slate-300 hover:bg-[#1e293b] hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <span className="text-xl">{med.icon}</span>
                    <div className="overflow-hidden">
                      <h4 className="font-bold text-xs truncate">{med.name}</h4>
                      <p className="text-[10px] text-slate-400 truncate">{med.category}</p>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-white shrink-0">
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
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Supplier
              </label>
              <select
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="w-full p-2 bg-[#1e293b] border border-slate-700 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="Apollo Pharma">Apollo Pharma</option>
                <option value="MedPlus Wholesalers">MedPlus Wholesalers</option>
                <option value="ABC Pharmaceuticals">ABC Pharmaceuticals</option>
                <option value="Sun Pharma Distributors">Sun Pharma Distributors</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Pack Quantity
              </label>
              <div className="flex items-center bg-[#1e293b] border border-slate-700 rounded-xl p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="h-7 w-7 text-slate-300 hover:bg-slate-700 rounded-lg"
                >
                  <Minus className="w-3.5 h-3.5" />
                </Button>
                <span className="flex-1 text-center font-bold text-xs font-mono">{quantity}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setQuantity(quantity + 1)}
                  className="h-7 w-7 text-slate-300 hover:bg-slate-700 rounded-lg text-indigo-400"
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Submit Footer */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-xs text-slate-400 hover:text-slate-200">
              Skip
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl px-4"
            >
              Submit Details
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

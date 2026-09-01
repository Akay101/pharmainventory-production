import React, { useState, useRef } from "react";
import axios from "axios";
import { API } from "../App";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import {
  Camera,
  Upload,
  X,
  Plus,
  Check,
  Trash2,
  Sparkles,
  CheckCircle2,
  Layers,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

export default function BillingScannerModal({
  open,
  onOpenChange,
  onTransferToBill,
}) {
  // Array of product scan items:
  // [{ id, photos: [{file, preview}], status: 'draft'|'scanning'|'done'|'error', scannedResult, matchedItem }]
  const [productCards, setProductCards] = useState([
    {
      id: "prod-1",
      photos: [],
      status: "draft",
      scannedResult: null,
      matchedItem: null,
    },
  ]);

  const handleAddPhotos = (cardId, files) => {
    if (!files || files.length === 0) return;
    const newPhotoObjs = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));

    setProductCards((prev) =>
      prev.map((c) =>
        c.id === cardId
          ? { ...c, photos: [...c.photos, ...newPhotoObjs] }
          : c
      )
    );
  };

  const handleRemovePhoto = (cardId, photoIdx) => {
    setProductCards((prev) =>
      prev.map((c) =>
        c.id === cardId
          ? {
              ...c,
              photos: c.photos.filter((_, idx) => idx !== photoIdx),
            }
          : c
      )
    );
  };

  const handleAddNewProductCard = () => {
    const newId = `prod-${Date.now()}`;
    setProductCards((prev) => [
      ...prev,
      {
        id: newId,
        photos: [],
        status: "draft",
        scannedResult: null,
        matchedItem: null,
      },
    ]);
  };

  const handleRemoveProductCard = (cardId) => {
    if (productCards.length <= 1) {
      toast.error("At least one product card is required");
      return;
    }
    setProductCards((prev) => prev.filter((c) => c.id !== cardId));
  };

  const handleStartScanForCard = async (card) => {
    if (card.photos.length === 0) {
      toast.error("Please capture or upload at least 1 photo for this product");
      return;
    }

    setProductCards((prev) =>
      prev.map((c) =>
        c.id === card.id ? { ...c, status: "scanning" } : c
      )
    );

    try {
      const formData = new FormData();
      card.photos.forEach((p) => {
        formData.append("files", p.file);
      });

      // Direct fast synchronous billing scan call (completes in 2-3 seconds)
      const res = await axios.post(`${API}/bills/scan-product`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data.success && res.data.matched_item) {
        const extracted = res.data.extracted_data || {};
        const matched = res.data.matched_item;

        setProductCards((prev) =>
          prev.map((c) =>
            c.id === card.id
              ? {
                  ...c,
                  status: "done",
                  scannedResult: extracted,
                  matchedItem: matched,
                }
              : c
          )
        );

        if (matched.match_type === "batch_exact") {
          toast.success(`Exact Batch Match found: ${matched.product_name} (Batch ${matched.batch_no})`);
        } else if (matched.match_type === "name_suggested") {
          toast.success(`Matched to inventory: ${matched.product_name}`);
        } else {
          toast.info(`Product extracted: ${matched.product_name} (Prepared as Unstocked / Negative Billing)`);
        }
      } else {
        throw new Error(res.data.detail || "AI scan failed");
      }
    } catch (err) {
      console.error("Billing scan error:", err);
      toast.error(err.response?.data?.detail || err.message || "Failed to scan product");
      setProductCards((prev) =>
        prev.map((c) =>
          c.id === card.id ? { ...c, status: "error" } : c
        )
      );
    }
  };

  const handleTransferAllToBill = () => {
    const completedCards = productCards.filter(
      (c) => c.status === "done" && c.matchedItem
    );

    if (completedCards.length === 0) {
      toast.error("No completed scanned items to transfer to bill");
      return;
    }

    const billItemsToInject = completedCards.map((c) => {
      const m = c.matchedItem;
      return {
        inventory_id: m.inventory_id || "",
        product_name: m.product_name || "Scanned Product",
        salt_composition: m.salt_composition || "",
        batch_no: m.batch_no || "",
        quantity: m.quantity || 1,
        available_quantity: m.available_quantity || 0,
        mrp: m.mrp || 0,
        unit_price: m.mrp || 0,
        purchase_price: m.purchase_price || 0,
        cgst: m.cgst || 0,
        sgst: m.sgst || 0,
        expiry_date: m.expiry_date || "",
        is_negative_billed: !m.inventory_id,
      };
    });

    onTransferToBill(billItemsToInject);
    toast.success(`Transferred ${billItemsToInject.length} product(s) to Bill!`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[92vh] flex flex-col p-0 gap-0 rounded-2xl bg-card border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 py-4 border-b border-border/80 bg-muted/30 flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-extrabold flex items-center gap-2">
                <span>Scan Products for Bill</span>
                <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 font-extrabold text-[10px]">
                  Instant AI Scan (2s)
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground font-medium">
                Upload 1 to 3 photos per product (Front label, Batch, Exp/MRP). AI will auto-map to inventory!
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 custom-scrollbar">
          {/* Action Bar */}
          <div className="flex items-center justify-between gap-3 bg-muted/40 p-3 rounded-xl border border-border/60">
            <div className="text-xs font-bold text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              <span>Products in Queue ({productCards.length})</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleAddNewProductCard}
              className="h-8 text-xs font-extrabold rounded-lg border-primary/30 text-primary hover:bg-primary/10 transition-all"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Product Card
            </Button>
          </div>

          {/* Product Cards List */}
          <div className="space-y-4">
            {productCards.map((card, cardIdx) => {
              const isScanning = card.status === "scanning";
              const isDone = card.status === "done";
              const isError = card.status === "error";

              return (
                <div
                  key={card.id}
                  className={`border rounded-2xl p-4 transition-all duration-200 ${
                    isDone
                      ? "bg-emerald-500/5 border-emerald-500/30 shadow-xs"
                      : isScanning
                      ? "bg-amber-500/5 border-amber-500/30 shadow-md"
                      : isError
                      ? "bg-destructive/5 border-destructive/30"
                      : "bg-background border-border/80 shadow-2xs"
                  }`}
                >
                  {/* Card Title & Status Header */}
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/40">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-black flex items-center justify-center">
                        #{cardIdx + 1}
                      </span>
                      <span className="text-xs font-extrabold text-foreground">
                        {card.matchedItem?.product_name || `Product #${cardIdx + 1}`}
                      </span>

                      {/* Status Badges */}
                      {isDone && card.matchedItem && (
                        <Badge
                          className={`text-[10px] font-extrabold rounded-full px-2.5 py-0.5 border ${
                            card.matchedItem.match_type === "batch_exact"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                              : card.matchedItem.match_type === "name_suggested"
                              ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
                              : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                          }`}
                        >
                          {card.matchedItem.match_type === "batch_exact" && "⚡ Batch Exact Match"}
                          {card.matchedItem.match_type === "name_suggested" && "✓ Name Matched"}
                          {card.matchedItem.match_type === "negative_billing" && "⚠️ Negative Billing"}
                        </Badge>
                      )}

                      {isScanning && (
                        <Badge className="bg-amber-500 text-white border-0 text-[10px] font-extrabold flex items-center gap-1.5">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Processing AI Scan...</span>
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {productCards.length > 1 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleRemoveProductCard(card.id)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                          title="Remove Product"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Photo Thumbnails Strip */}
                  <div className="space-y-2 mb-3">
                    <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                      Photos ({card.photos.length}) - Capture Front, Side/Batch
                    </Label>
                    <div className="flex flex-wrap items-center gap-2.5">
                      {card.photos.map((photo, pIdx) => (
                        <div
                          key={pIdx}
                          className="relative w-20 h-20 rounded-xl overflow-hidden border-2 border-primary/30 shadow-xs group bg-black/5"
                        >
                          <img
                            src={photo.preview}
                            alt={`Product photo ${pIdx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          {!isScanning && (
                            <button
                              type="button"
                              onClick={() => handleRemovePhoto(card.id, pIdx)}
                              className="absolute top-1 right-1 bg-black/70 text-white p-1 rounded-full opacity-90 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}

                      {!isScanning && card.photos.length < 5 && (
                        <div className="flex gap-2">
                          {/* File Upload Button */}
                          <label className="w-20 h-20 rounded-xl border-2 border-dashed border-border/80 hover:border-primary bg-muted/20 hover:bg-primary/5 flex flex-col items-center justify-center cursor-pointer transition-all">
                            <Upload className="w-5 h-5 text-muted-foreground mb-1" />
                            <span className="text-[10px] font-bold text-muted-foreground">Upload</span>
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={(e) => handleAddPhotos(card.id, e.target.files)}
                            />
                          </label>

                          {/* Camera Capture Button (Mobile Friendly) */}
                          <label className="w-20 h-20 rounded-xl border-2 border-dashed border-primary/40 hover:border-primary bg-primary/5 flex flex-col items-center justify-center cursor-pointer transition-all">
                            <Camera className="w-5 h-5 text-primary mb-1" />
                            <span className="text-[10px] font-bold text-primary">Camera</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={(e) => handleAddPhotos(card.id, e.target.files)}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Scanned & Matched Result Card Details */}
                  {isDone && card.matchedItem && (
                    <div className="mt-3 bg-background border border-border/80 rounded-xl p-3 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <Label className="text-[10px] font-extrabold text-muted-foreground uppercase">Product Name</Label>
                          <Input
                            value={card.matchedItem.product_name}
                            onChange={(e) =>
                              setProductCards((prev) =>
                                prev.map((c) =>
                                  c.id === card.id
                                    ? {
                                        ...c,
                                        matchedItem: {
                                          ...c.matchedItem,
                                          product_name: e.target.value,
                                        },
                                      }
                                    : c
                                )
                              )
                            }
                            className="h-8 text-xs font-bold"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] font-extrabold text-muted-foreground uppercase">Batch Number</Label>
                          <Input
                            value={card.matchedItem.batch_no}
                            onChange={(e) =>
                              setProductCards((prev) =>
                                prev.map((c) =>
                                  c.id === card.id
                                    ? {
                                        ...c,
                                        matchedItem: {
                                          ...c.matchedItem,
                                          batch_no: e.target.value,
                                        },
                                      }
                                    : c
                                )
                              )
                            }
                            className="h-8 text-xs font-mono font-bold"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] font-extrabold text-muted-foreground uppercase">MRP (₹)</Label>
                          <Input
                            type="number"
                            value={card.matchedItem.mrp}
                            onChange={(e) =>
                              setProductCards((prev) =>
                                prev.map((c) =>
                                  c.id === card.id
                                    ? {
                                        ...c,
                                        matchedItem: {
                                          ...c.matchedItem,
                                          mrp: parseFloat(e.target.value) || 0,
                                        },
                                      }
                                    : c
                                )
                              )
                            }
                            className="h-8 text-xs font-mono font-bold"
                          />
                        </div>
                      </div>

                      {card.matchedItem.inventory_id ? (
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center gap-1 mt-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Linked to Inventory Batch: {card.matchedItem.batch_no} ({card.matchedItem.available_quantity} units in stock)
                        </p>
                      ) : (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 font-extrabold flex items-center gap-1 mt-1">
                          ⚠️ Unstocked Item (Will add to bill as Negative Billing)
                        </p>
                      )}
                    </div>
                  )}

                  {/* Scan Trigger Button */}
                  {card.status === "draft" && card.photos.length > 0 && (
                    <Button
                      size="sm"
                      onClick={() => handleStartScanForCard(card)}
                      className="mt-2 w-full h-8 text-xs font-extrabold bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-all"
                    >
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Start Instant AI Extraction
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <DialogFooter className="px-5 py-3 border-t border-border/80 bg-muted/20 flex-row items-center justify-between sm:justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="h-9 px-4 text-xs font-bold text-muted-foreground hover:bg-muted"
          >
            Cancel
          </Button>

          <Button
            onClick={handleTransferAllToBill}
            disabled={
              !productCards.some((c) => c.status === "done" && c.matchedItem)
            }
            className="h-9 px-5 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md shadow-emerald-600/20 transition-all hover:scale-[1.02]"
          >
            <Check className="w-4 h-4 mr-1.5" />
            Transfer {productCards.filter((c) => c.status === "done").length} Item(s) to Bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

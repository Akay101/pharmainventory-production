import React, { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Package,
  Plus,
  Sparkles,
  Tag,
  Layers,
  Percent,
  MapPin,
  Building2,
  ShieldAlert,
  FileText,
  Loader2,
  Hash,
} from "lucide-react";
const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:8001"
    : "");
const API = `${BACKEND_URL}/api`;

const PACK_TYPES = ["Strip", "Bottle", "Tube", "Packet", "Box", "Unit"];
const DOSAGE_FORMS = [
  "tablet",
  "capsule",
  "syrup",
  "suspension",
  "injection",
  "ointment",
  "cream",
  "gel",
  "drops",
  "inhaler",
  "powder",
  "sachet",
  "lotion",
  "spray",
  "other",
];

const CATEGORIES = [
  { value: "medicine", label: "Medicine (Allopathy)" },
  { value: "ayurvedic", label: "Ayurvedic / Herbal" },
  { value: "otc", label: "OTC / General" },
  { value: "cosmetic", label: "Cosmetic / Derma" },
  { value: "consumable", label: "Consumable / Surgical" },
  { value: "equipment", label: "Equipment / Device" },
  { value: "other", label: "Other" },
];

const GST_RATES = [0, 5, 12, 18, 28];

export default function ProductCatalogModal({
  isOpen,
  onClose,
  initialName = "",
  onSuccess,
  title = "Create Product Catalog",
}) {
  const [formData, setFormData] = useState({
    name: "",
    category: "medicine",
    dosage_form: "tablet",
    manufacturer: "",
    salt_composition: "",
    pack_type: "Strip",
    units_per_pack: "10",
    package_details: "",
    hsn_no: "",
    tax_rate: "5",
    mrp: "",
    trade_price: "",
    low_stock_threshold: "10",
    shortage_threshold: "10",
    rack_location: "",
    description: "",
  });

  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const name = initialName ? initialName.trim() : "";
      setFormData({
        name,
        category: "medicine",
        dosage_form: "tablet",
        manufacturer: "",
        salt_composition: "",
        pack_type: "Strip",
        units_per_pack: "10",
        package_details: "",
        hsn_no: "",
        tax_rate: "5",
        mrp: "",
        trade_price: "",
        low_stock_threshold: "10",
        shortage_threshold: "10",
        rack_location: "",
        description: "",
      });
    }
  }, [isOpen, initialName]);

  // Auto-generate suggested package details when pack_type or units change
  const handlePackChange = (field, val) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: val };
      const units = field === "units_per_pack" ? val : prev.units_per_pack;
      const type = field === "pack_type" ? val : prev.pack_type;
      const form = field === "dosage_form" ? val : prev.dosage_form;

      // Suggest package details if empty or follows previous default
      if (
        !prev.package_details ||
        prev.package_details.includes("Strip of") ||
        prev.package_details.includes("Bottle of") ||
        prev.package_details.includes("Tube of") ||
        prev.package_details.includes("Box of")
      ) {
        if (type === "Strip") {
          updated.package_details = `1 Strip of ${units} ${form.charAt(0).toUpperCase() + form.slice(1)}`;
        } else if (type === "Bottle") {
          updated.package_details = `1 Bottle`;
        } else if (type === "Tube") {
          updated.package_details = `1 Tube`;
        } else if (type === "Box") {
          updated.package_details = `1 Box of ${units} Units`;
        } else {
          updated.package_details = `${units} ${form}`;
        }
      }
      return updated;
    });
  };

  const handleAiEnrich = async () => {
    if (!formData.name.trim()) {
      toast.error("Please enter a product name first");
      return;
    }
    setAiLoading(true);
    try {
      const res = await axios.post(
        `${API}/medicines/enrich`,
        {
          product_name: formData.name.trim(),
        },
        { withCredentials: true }
      );
      if (res.data) {
        setFormData((prev) => {
          const nextForm = { ...prev };
          if (res.data.manufacturer) nextForm.manufacturer = res.data.manufacturer;
          if (res.data.salt_composition) nextForm.salt_composition = res.data.salt_composition;
          if (res.data.dosage_form) {
            const df = res.data.dosage_form.toLowerCase().trim();
            if (DOSAGE_FORMS.includes(df)) nextForm.dosage_form = df;
          }
          if (res.data.pack_type) {
            const pt = res.data.pack_type.trim();
            if (PACK_TYPES.includes(pt)) nextForm.pack_type = pt;
          }
          if (res.data.units_per_pack && !isNaN(parseInt(res.data.units_per_pack))) {
            nextForm.units_per_pack = String(parseInt(res.data.units_per_pack));
          }
          return nextForm;
        });
        toast.success("AI enriched product details!");
      }
    } catch (err) {
      toast.info("Could not auto-enrich details, please fill manually.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Product name is required");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: formData.name.trim(),
        product_name: formData.name.trim(),
        category: formData.category,
        dosage_form: formData.dosage_form,
        manufacturer: formData.manufacturer.trim(),
        salt_composition: formData.salt_composition.trim(),
        pack_type: formData.pack_type,
        units_per_pack: parseInt(formData.units_per_pack) || 1,
        package_details:
          formData.package_details.trim() ||
          `${formData.units_per_pack} ${formData.dosage_form}`,
        packaging_label: `${formData.units_per_pack} ${formData.dosage_form}`,
        hsn_no: formData.hsn_no.trim(),
        tax_rate: parseFloat(formData.tax_rate) || 5,
        cgst: (parseFloat(formData.tax_rate) || 5) / 2,
        sgst: (parseFloat(formData.tax_rate) || 5) / 2,
        mrp: parseFloat(formData.mrp) || 0,
        unit_mrp:
          parseFloat(formData.mrp) > 0 && parseInt(formData.units_per_pack) > 0
            ? parseFloat(
                (
                  parseFloat(formData.mrp) / parseInt(formData.units_per_pack)
                ).toFixed(2)
              )
            : 0,
        trade_price:
          parseFloat(formData.trade_price) ||
          (parseFloat(formData.mrp) > 0
            ? parseFloat((parseFloat(formData.mrp) * 0.7).toFixed(2))
            : 0),
        low_stock_threshold: parseInt(formData.low_stock_threshold) || 10,
        shortage_threshold: parseInt(formData.shortage_threshold) || 10,
        rack_location: formData.rack_location.trim(),
        description: formData.description.trim(),
      };

      const res = await axios.post(`${API}/products`, payload, {
        withCredentials: true,
      });
      const created = res.data.product || { ...payload, id: res.data.id };

      toast.success(`Product Catalog "${created.name}" created!`);
      if (onSuccess) {
        onSuccess(created);
      }
      onClose();
    } catch (err) {
      console.error("Create product catalog error:", err);
      toast.error(
        err.response?.data?.detail || "Failed to create product catalog"
      );
    } finally {
      setLoading(false);
    }
  };

  const gstVal = parseFloat(formData.tax_rate) || 0;
  const mrpVal = parseFloat(formData.mrp) || 0;
  const unitsVal = parseInt(formData.units_per_pack) || 1;
  const unitMrpPreview =
    mrpVal > 0 && unitsVal > 0 ? (mrpVal / unitsVal).toFixed(2) : "-";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl rounded-2xl border border-border shadow-2xl p-0 overflow-hidden bg-card">
        <DialogHeader className="p-5 border-b border-border/60 bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-500 shadow-xs">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-black text-foreground tracking-tight">
                  {title}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Define master product specifications, packaging units, HSN, and GST rates.
                </DialogDescription>
              </div>
            </div>
            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-500 border border-orange-500/20">
              Master Catalog
            </span>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* SECTION 1: Basic & Medical Identity */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-orange-500" />
                Product Identity & Composition
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAiEnrich}
                disabled={aiLoading || !formData.name.trim()}
                className="h-7 text-[11px] font-extrabold text-orange-400 hover:text-orange-500 hover:bg-orange-500/10 px-2 rounded-lg flex items-center gap-1"
              >
                {aiLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                Auto-fill with AI
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2 space-y-1">
                <Label className="text-xs font-bold text-foreground">
                  Product Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  required
                  placeholder="e.g. Dolo 650 Tablet"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="h-9 text-xs font-bold rounded-xl border-border bg-background focus:border-orange-500"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-foreground">
                  Category
                </Label>
                <Select
                  value={formData.category}
                  onValueChange={(val) =>
                    setFormData({ ...formData, category: val })
                  }
                >
                  <SelectTrigger className="h-9 text-xs font-semibold rounded-xl border-border bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem
                        key={cat.value}
                        value={cat.value}
                        className="text-xs font-medium"
                      >
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-foreground">
                  Dosage Form
                </Label>
                <Select
                  value={formData.dosage_form}
                  onValueChange={(val) =>
                    handlePackChange("dosage_form", val)
                  }
                >
                  <SelectTrigger className="h-9 text-xs font-semibold rounded-xl border-border bg-background capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOSAGE_FORMS.map((form) => (
                      <SelectItem
                        key={form}
                        value={form}
                        className="text-xs capitalize font-medium"
                      >
                        {form}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-foreground flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-muted-foreground" />
                  Manufacturer / Brand
                </Label>
                <Input
                  placeholder="e.g. Micro Labs Ltd"
                  value={formData.manufacturer}
                  onChange={(e) =>
                    setFormData({ ...formData, manufacturer: e.target.value })
                  }
                  className="h-9 text-xs font-semibold rounded-xl border-border bg-background"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-foreground">
                  Salt / Active Ingredients
                </Label>
                <Input
                  placeholder="e.g. Paracetamol (650mg)"
                  value={formData.salt_composition}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      salt_composition: e.target.value,
                    })
                  }
                  className="h-9 text-xs font-semibold rounded-xl border-border bg-background"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: Packaging & Unit Configuration */}
          <div className="space-y-3">
            <div className="border-b border-border/40 pb-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-500" />
                Packaging & Pack Units
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-foreground">
                  Pack Type
                </Label>
                <Select
                  value={formData.pack_type}
                  onValueChange={(val) => handlePackChange("pack_type", val)}
                >
                  <SelectTrigger className="h-9 text-xs font-semibold rounded-xl border-border bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PACK_TYPES.map((type) => (
                      <SelectItem
                        key={type}
                        value={type}
                        className="text-xs font-medium"
                      >
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-foreground">
                  Units Per Pack <span className="text-muted-foreground font-normal">(e.g. 10 tabs/strip)</span>
                </Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="10"
                  value={formData.units_per_pack}
                  onChange={(e) =>
                    handlePackChange("units_per_pack", e.target.value)
                  }
                  className="h-9 text-xs font-bold text-center rounded-xl border-border bg-background"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-foreground">
                  Packaging Label / Details
                </Label>
                <Input
                  placeholder="e.g. 1 Strip of 10 Tablet"
                  value={formData.package_details}
                  onChange={(e) =>
                    setFormData({ ...formData, package_details: e.target.value })
                  }
                  className="h-9 text-xs font-semibold rounded-xl border-border bg-background"
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: Taxes & Pricing */}
          <div className="space-y-3">
            <div className="border-b border-border/40 pb-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-emerald-500" />
                Taxes & Catalog Pricing
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-foreground flex items-center gap-1">
                  <Hash className="w-3 h-3 text-muted-foreground" />
                  HSN Code
                </Label>
                <Input
                  placeholder="e.g. 30049061"
                  value={formData.hsn_no}
                  onChange={(e) =>
                    setFormData({ ...formData, hsn_no: e.target.value })
                  }
                  className="h-9 text-xs font-mono font-semibold rounded-xl border-border bg-background"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-foreground">
                  GST Rate %
                </Label>
                <Select
                  value={String(formData.tax_rate)}
                  onValueChange={(val) =>
                    setFormData({ ...formData, tax_rate: val })
                  }
                >
                  <SelectTrigger className="h-9 text-xs font-bold rounded-xl border-border bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GST_RATES.map((rate) => (
                      <SelectItem
                        key={rate}
                        value={String(rate)}
                        className="text-xs font-medium"
                      >
                        {rate}% ({rate / 2}% + {rate / 2}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground font-mono">
                  CGST: {(gstVal / 2).toFixed(1)}% | SGST: {(gstVal / 2).toFixed(1)}%
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-foreground">
                  MRP per Pack (₹)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formData.mrp}
                  onChange={(e) =>
                    setFormData({ ...formData, mrp: e.target.value })
                  }
                  className="h-9 text-xs font-bold rounded-xl border-border bg-background text-amber-500"
                />
                <p className="text-[10px] text-muted-foreground font-mono">
                  Unit MRP: ₹{unitMrpPreview}
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-foreground">
                  Est. PTR / Trade Price (₹)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formData.trade_price}
                  onChange={(e) =>
                    setFormData({ ...formData, trade_price: e.target.value })
                  }
                  className="h-9 text-xs font-bold rounded-xl border-border bg-background text-emerald-500"
                />
                <p className="text-[10px] text-muted-foreground">
                  Chemist purchase rate
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 4: Thresholds & Storage Location */}
          <div className="space-y-3">
            <div className="border-b border-border/40 pb-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-blue-500" />
                Alert Thresholds & Pharmacy Location
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-foreground">
                  Low Stock Threshold
                </Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="10"
                  value={formData.low_stock_threshold}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      low_stock_threshold: e.target.value,
                    })
                  }
                  className="h-9 text-xs font-semibold rounded-xl border-border bg-background"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-foreground">
                  Shortage List Threshold
                </Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="10"
                  value={formData.shortage_threshold}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      shortage_threshold: e.target.value,
                    })
                  }
                  className="h-9 text-xs font-semibold rounded-xl border-border bg-background"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-muted-foreground" />
                  Rack / Shelf Location
                </Label>
                <Input
                  placeholder="e.g. Rack A-1, Shelf 3"
                  value={formData.rack_location}
                  onChange={(e) =>
                    setFormData({ ...formData, rack_location: e.target.value })
                  }
                  className="h-9 text-xs font-semibold rounded-xl border-border bg-background"
                />
              </div>
            </div>
          </div>
        </form>

        <DialogFooter className="p-4 border-t border-border/60 bg-muted/20 flex items-center justify-end gap-2 flex-wrap">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
            className="h-9 text-xs font-bold rounded-xl"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="h-9 px-5 text-xs font-extrabold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl shadow-sm border-none flex items-center gap-1.5 cursor-pointer"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
            )}
            Save to Product Catalog
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import { isScheduleH1 } from "../lib/scheduleH1";
import { catalogFormErrors, needsSalt } from "../lib/catalogDetails";
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
  initialValues = null, // details already on the purchase row
  onUseExisting = null, // pick a similar product instead of creating one
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
    schedule_h1: "auto",
  });

  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [triedSave, setTriedSave] = useState(false);
  const errors = triedSave ? catalogFormErrors(formData) : {};
  const req = <span className="text-rose-500">*</span>;
  const fieldError = (field) =>
    errors[field] && <p className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">{errors[field]}</p>;
  const invalidCls = (field) => (errors[field] ? "!border-rose-500 ring-1 ring-rose-500/30" : "");

  useEffect(() => {
    if (isOpen) {
      setTriedSave(false);
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
        schedule_h1: "auto",
        ...(initialValues || {}),
      });
    }
  }, [isOpen, initialName]); // eslint-disable-line

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

  // Before a new entry is made: products that may already be this one
  const [similar, setSimilar] = useState([]);
  useEffect(() => {
    const name = formData.name.trim();
    setSimilar([]);
    if (!isOpen || name.length < 3) return undefined;
    const timer = setTimeout(async () => {
      try {
        const res = await axios.post(`${API}/purchases/match-suggestions`, { items: [{ product_name: name }] }, { withCredentials: true });
        setSimilar((res.data.matches?.[0]?.suggestions || []).slice(0, 3));
      } catch {
        setSimilar([]);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [formData.name, isOpen]);

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
    setTriedSave(true);
    const problems = catalogFormErrors(formData);
    const first = Object.keys(problems)[0];
    if (first) {
      toast.error("Fill in the required product details");
      const el = document.querySelector(`[data-catalog-field="${first}"]`);
      el?.scrollIntoView({ block: "center" });
      el?.focus({ preventScroll: true });
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
        // "auto": detected from the salt; yes / no: the pharmacy's own mark
        schedule_h1: formData.schedule_h1 === "auto" ? null : formData.schedule_h1,
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
      // Already in the catalog with full details: use that entry
      if (err.response?.status === 409 && err.response.data?.product) {
        toast.info(err.response.data.detail);
        if (onSuccess) onSuccess(err.response.data.product);
        onClose();
        return;
      }
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
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-hidden flex flex-col p-0 rounded-2xl border border-border shadow-2xl bg-card gap-0">
        <DialogHeader className="shrink-0 p-4 sm:p-5 border-b border-border/60 bg-muted/30">
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
            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-500 border border-orange-500/20 max-md:hidden">
              Master Catalog
            </span>
          </div>
        </DialogHeader>

        <form
          id="product-catalog-form"
          onSubmit={handleSubmit}
          noValidate
          className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5"
        >
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div className="md:col-span-2 space-y-1.5">
                <Label className="block text-xs font-bold text-foreground">
                  Product Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  data-catalog-field="name"
                  aria-invalid={!!errors.name}
                  placeholder="e.g. Dolo 650 Tablet"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className={`h-9 text-xs font-bold rounded-xl border border-border bg-background focus:border-orange-500 px-3 ${invalidCls("name")}`}
                />
                {fieldError("name") || (
                  <p className="text-[10px] text-muted-foreground">
                    Official brand & medicine strength name
                  </p>
                )}
                {similar.length > 0 && (
                  <div data-testid="catalog-similar" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2">
                    <p className="text-[11px] font-semibold text-foreground">Already have it? Use it to avoid a duplicate.</p>
                    <div className="mt-1 space-y-1">
                      {similar.map((m) => (
                        <div key={`${m.source}-${m.product_id}`} className="flex items-center gap-2 text-[11px]">
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-bold text-foreground">{m.product_name}</span>
                            <span className="text-muted-foreground"> · {m.source === "global" ? "Medicine database" : "Your catalog"}</span>
                          </span>
                          {onUseExisting && (
                            <button
                              type="button"
                              onClick={() => {
                                onUseExisting(m);
                                onClose();
                              }}
                              className="shrink-0 font-bold text-primary hover:underline cursor-pointer"
                            >
                              Use
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="block text-xs font-bold text-foreground">
                  Category
                </Label>
                <Select
                  value={formData.category}
                  onValueChange={(val) =>
                    setFormData({ ...formData, category: val })
                  }
                >
                  <SelectTrigger className="h-9 text-xs font-semibold rounded-xl border border-border bg-background px-3">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent className="z-[999999]">
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
                <p className="text-[10px] text-muted-foreground">
                  Primary medicine classification
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="block text-xs font-bold text-foreground">
                  Dosage Form
                </Label>
                <Select
                  value={formData.dosage_form}
                  onValueChange={(val) =>
                    handlePackChange("dosage_form", val)
                  }
                >
                  <SelectTrigger className="h-9 text-xs font-semibold rounded-xl border border-border bg-background capitalize px-3">
                    <SelectValue placeholder="Select Dosage Form" />
                  </SelectTrigger>
                  <SelectContent className="z-[999999]">
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
                <p className="text-[10px] text-muted-foreground">
                  Delivery form (Tablet, Syrup, etc.)
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-foreground flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-muted-foreground" />
                  Manufacturer / Brand {req}
                </Label>
                <Input
                  data-catalog-field="manufacturer"
                  aria-invalid={!!errors.manufacturer}
                  placeholder="e.g. Micro Labs Ltd"
                  value={formData.manufacturer}
                  onChange={(e) =>
                    setFormData({ ...formData, manufacturer: e.target.value })
                  }
                  className={`h-9 text-xs font-semibold rounded-xl border border-border bg-background px-3 ${invalidCls("manufacturer")}`}
                />
                {fieldError("manufacturer") || (
                  <p className="text-[10px] text-muted-foreground">
                    Pharma manufacturing company
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="block text-xs font-bold text-foreground">
                  Salt / Active Ingredients {needsSalt(formData) && req}
                </Label>
                <Input
                  data-catalog-field="salt_composition"
                  aria-invalid={!!errors.salt_composition}
                  placeholder="e.g. Paracetamol (650mg)"
                  value={formData.salt_composition}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      salt_composition: e.target.value,
                    })
                  }
                  className={`h-9 text-xs font-semibold rounded-xl border border-border bg-background px-3 ${invalidCls("salt_composition")}`}
                />
                {fieldError("salt_composition") || (
                  <p className="text-[10px] text-muted-foreground">
                    Active therapeutic composition
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="block text-xs font-bold text-foreground">Schedule H1</Label>
                <div className="flex gap-1" role="radiogroup" aria-label="Schedule H1">
                  {[
                    ["auto", `Auto${isScheduleH1({ salt_composition: formData.salt_composition, product_name: formData.name }) ? " (H1)" : ""}`],
                    ["yes", "Yes"],
                    ["no", "No"],
                  ].map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={formData.schedule_h1 === v}
                      onClick={() => setFormData({ ...formData, schedule_h1: v })}
                      className={`h-8 px-3 rounded-lg text-xs font-bold border transition-colors ${
                        formData.schedule_h1 === v
                          ? v === "no"
                            ? "bg-muted text-foreground border-border"
                            : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/40"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Auto detects H1 salts (e.g. cefixime, tramadol, alprazolam). H1 bills need a prescription attached.
                </p>
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div className="space-y-1.5">
                <Label className="block text-xs font-bold text-foreground">
                  Pack Type
                </Label>
                <Select
                  value={formData.pack_type}
                  onValueChange={(val) => handlePackChange("pack_type", val)}
                >
                  <SelectTrigger className="h-9 text-xs font-semibold rounded-xl border border-border bg-background px-3">
                    <SelectValue placeholder="Select Pack Type" />
                  </SelectTrigger>
                  <SelectContent className="z-[999999]">
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
                <p className="text-[10px] text-muted-foreground">
                  Primary packaging container form
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="block text-xs font-bold text-foreground">
                  Units Per Pack {req} <span className="text-muted-foreground font-normal">(e.g. 10 tabs/strip)</span>
                </Label>
                <Input
                  data-catalog-field="units_per_pack"
                  aria-invalid={!!errors.units_per_pack}
                  type="number"
                  min="1"
                  placeholder="10"
                  value={formData.units_per_pack}
                  onChange={(e) =>
                    handlePackChange("units_per_pack", e.target.value)
                  }
                  className={`h-9 text-xs font-bold text-center rounded-xl border border-border bg-background px-3 ${invalidCls("units_per_pack")}`}
                />
                {fieldError("units_per_pack") || (
                  <p className="text-[10px] text-muted-foreground text-center">
                    Items contained in 1 pack
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="block text-xs font-bold text-foreground">
                  Packaging Label / Details
                </Label>
                <Input
                  placeholder="e.g. 1 Strip of 10 Tablet"
                  value={formData.package_details}
                  onChange={(e) =>
                    setFormData({ ...formData, package_details: e.target.value })
                  }
                  className="h-9 text-xs font-semibold rounded-xl border border-border bg-background px-3"
                />
                <p className="text-[10px] text-muted-foreground">
                  Printed package description
                </p>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
              <div className="space-y-1.5">
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
                  className="h-9 text-xs font-mono font-semibold rounded-xl border border-border bg-background px-3"
                />
                <p className="text-[10px] text-muted-foreground font-mono">
                  HSN / SAC Code
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="block text-xs font-bold text-foreground">
                  GST Rate %
                </Label>
                <Select
                  value={String(formData.tax_rate)}
                  onValueChange={(val) =>
                    setFormData({ ...formData, tax_rate: val })
                  }
                >
                  <SelectTrigger className="h-9 text-xs font-bold rounded-xl border border-border bg-background px-3">
                    <SelectValue placeholder="Select GST %" />
                  </SelectTrigger>
                  <SelectContent className="z-[999999]">
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

              <div className="space-y-1.5">
                <Label className="block text-xs font-bold text-foreground">
                  MRP per Pack (₹) {req}
                </Label>
                <Input
                  data-catalog-field="mrp"
                  aria-invalid={!!errors.mrp}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formData.mrp}
                  onChange={(e) =>
                    setFormData({ ...formData, mrp: e.target.value })
                  }
                  className={`h-9 text-xs font-bold rounded-xl border border-border bg-background text-amber-500 font-mono px-3 ${invalidCls("mrp")}`}
                />
                {fieldError("mrp") || (
                  <p className="text-[10px] text-muted-foreground font-mono">
                    Unit MRP: ₹{unitMrpPreview}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="block text-xs font-bold text-foreground">
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
                  className="h-9 text-xs font-bold rounded-xl border border-border bg-background text-emerald-500 font-mono px-3"
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div className="space-y-1.5">
                <Label className="block text-xs font-bold text-foreground">
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
                  className="h-9 text-xs font-semibold text-center rounded-xl border border-border bg-background px-3"
                />
                <p className="text-[10px] text-muted-foreground text-center">
                  Alerts on low inventory
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="block text-xs font-bold text-foreground">
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
                  className="h-9 text-xs font-semibold text-center rounded-xl border border-border bg-background px-3"
                />
                <p className="text-[10px] text-muted-foreground text-center">
                  Auto-adds to order shortage
                </p>
              </div>

              <div className="space-y-1.5">
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
                  className="h-9 text-xs font-semibold rounded-xl border border-border bg-background px-3"
                />
                <p className="text-[10px] text-muted-foreground">
                  Physical storage rack location
                </p>
              </div>
            </div>
          </div>
        </form>

        <DialogFooter className="shrink-0 p-3.5 sm:p-4 border-t border-border/60 bg-muted/20 flex items-center justify-end gap-2 flex-wrap">
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
            type="submit"
            form="product-catalog-form"
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

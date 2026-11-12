// Pricing page: GST, add-on prices (extra pharmacist users, linked
// pharmacies, users included with the plan) and the seller details printed
// on DavaDesk's GST invoices.
import React, { useEffect, useState } from "react";
import { Building2, FileText, Loader2, Percent, Save, Users } from "lucide-react";
import { toast } from "sonner";
import { AdminAPI, apiError } from "../api";

const inputCls =
  "w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:border-brand-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400";
const labelCls = "text-[11px] font-bold text-slate-500 uppercase tracking-wide";
const rs = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function Shell({ title, icon: Icon, subtitle, children, onSave, saving, canEdit, testid }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs" data-testid={testid}>
      <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-black text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {canEdit && (
          <button onClick={onSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-xs font-extrabold text-white bg-brand-500 hover:bg-brand-600 rounded-xl disabled:opacity-40">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
          </button>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function BillingConfigCards({ data, canEdit, onSaved }) {
  const [gst, setGst] = useState(data.gst_percent ?? 18);
  const [addons, setAddons] = useState(data.addons);
  const [invoice, setInvoice] = useState(data.invoice);
  const [saving, setSaving] = useState(null);
  useEffect(() => {
    setGst(data.gst_percent ?? 18);
    setAddons(data.addons);
    setInvoice(data.invoice);
  }, [data]);

  const run = async (key, fn, ok) => {
    setSaving(key);
    try {
      await fn();
      toast.success(ok);
      onSaved();
    } catch (err) {
      toast.error(apiError(err, "Couldn't save"));
    } finally {
      setSaving(null);
    }
  };

  const plan = data.plans?.find((p) => p.code === "COMPLETE");
  const yearlySaving = addons ? addons.user_seat.monthly_rupees * 12 - addons.user_seat.yearly_rupees : 0;
  const setSeat = (k, v) => setAddons({ ...addons, user_seat: { ...addons.user_seat, [k]: v } });
  const setPh = (k, v) => setAddons({ ...addons, pharmacy: { ...addons.pharmacy, [k]: v } });
  const setInv = (k, v) => setInvoice({ ...invoice, [k]: v });

  return (
    <>
      <Shell
        title="GST"
        icon={Percent}
        subtitle="Added on top of every plan and add-on price, after offers and promo codes. Credit packs are priced including GST."
        canEdit={canEdit}
        saving={saving === "gst"}
        onSave={() => run("gst", () => AdminAPI.updateGst({ gst_percent: Number(gst) }), `GST set to ${gst}%`)}
        testid="gst-card"
      >
        <div className="grid sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className={labelCls}>GST %</label>
            <input type="number" min="0" max="28" step="0.5" className={inputCls} disabled={!canEdit} value={gst} onChange={(e) => setGst(e.target.value)} />
          </div>
          {plan && (
            <p className="sm:col-span-2 text-xs font-semibold text-slate-500">
              {plan.name}: {rs(plan.price_rupees)} + {gst}% GST = <strong className="text-slate-800">{rs(plan.price_rupees * (1 + Number(gst) / 100))}</strong> a year
            </p>
          )}
        </div>
      </Shell>

      {addons && (
        <Shell
          title="Add-ons"
          icon={Users}
          subtitle="Prices before GST. Changes apply to new checkouts; what's already paid is unchanged."
          canEdit={canEdit}
          saving={saving === "addons"}
          onSave={() =>
            run(
              "addons",
              () =>
                AdminAPI.updateAddonPricing({
                  included_users: Number(addons.included_users),
                  user_seat: { enabled: !!addons.user_seat.enabled, monthly_rupees: Number(addons.user_seat.monthly_rupees), yearly_rupees: Number(addons.user_seat.yearly_rupees), max_per_order: Number(addons.user_seat.max_per_order) || 20 },
                  pharmacy: { enabled: !!addons.pharmacy.enabled, yearly_rupees: Number(addons.pharmacy.yearly_rupees), max_linked: Number(addons.pharmacy.max_linked) || 20 },
                }),
              "Add-on prices saved"
            )
          }
          testid="addons-card"
        >
          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <h4 className="text-xs font-black text-slate-800">Included with the plan</h4>
              <label className={labelCls}>Pharmacist users</label>
              <input type="number" min="0" max="20" className={inputCls} disabled={!canEdit} value={addons.included_users} onChange={(e) => setAddons({ ...addons, included_users: e.target.value })} />
              <p className="text-[11px] text-slate-500">Besides the owner. Lowering this frees seats for new invites only; current users keep theirs.</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-800">Extra pharmacist user</h4>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                  <input type="checkbox" disabled={!canEdit} checked={!!addons.user_seat.enabled} onChange={(e) => setSeat("enabled", e.target.checked)} /> On sale
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Per month (₹)</label>
                  <input type="number" min="1" className={inputCls} disabled={!canEdit} value={addons.user_seat.monthly_rupees} onChange={(e) => setSeat("monthly_rupees", e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Per year (₹)</label>
                  <input type="number" min="1" className={inputCls} disabled={!canEdit} value={addons.user_seat.yearly_rupees} onChange={(e) => setSeat("yearly_rupees", e.target.value)} />
                </div>
              </div>
              <p className="text-[11px] text-slate-500">{yearlySaving > 0 ? `Yearly saves ${rs(yearlySaving)} over 12 months.` : "Yearly isn't cheaper than 12 months; check the prices."}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-800 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" /> Linked pharmacy
                </h4>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                  <input type="checkbox" disabled={!canEdit} checked={!!addons.pharmacy.enabled} onChange={(e) => setPh("enabled", e.target.checked)} /> On sale
                </label>
              </div>
              <label className={labelCls}>Per year (₹)</label>
              <input type="number" min="1" className={inputCls} disabled={!canEdit} value={addons.pharmacy.yearly_rupees} onChange={(e) => setPh("yearly_rupees", e.target.value)} />
              <label className={labelCls}>Most per account</label>
              <input type="number" min="1" max="100" className={inputCls} disabled={!canEdit} value={addons.pharmacy.max_linked} onChange={(e) => setPh("max_linked", e.target.value)} />
            </div>
          </div>
        </Shell>
      )}

      {invoice && (
        <Shell
          title="GST invoice details"
          icon={FileText}
          subtitle="Printed on every invoice DavaDesk issues. Inside the seller's state: CGST + SGST; elsewhere: IGST. New invoices use the details saved here."
          canEdit={canEdit}
          saving={saving === "invoice"}
          onSave={() => run("invoice", () => AdminAPI.updateInvoiceConfig({ ...invoice, seller_gstin: String(invoice.seller_gstin || "").toUpperCase() }), "Invoice details saved")}
          testid="invoice-config-card"
        >
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Seller legal name</label>
              <input className={inputCls} disabled={!canEdit} value={invoice.seller_name} onChange={(e) => setInv("seller_name", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Seller GSTIN</label>
              <input className={`${inputCls} uppercase`} maxLength={15} disabled={!canEdit} value={invoice.seller_gstin} onChange={(e) => setInv("seller_gstin", e.target.value.toUpperCase())} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Seller address</label>
              <input className={inputCls} disabled={!canEdit} value={invoice.seller_address} onChange={(e) => setInv("seller_address", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Email on invoice</label>
              <input className={inputCls} disabled={!canEdit} value={invoice.seller_email} onChange={(e) => setInv("seller_email", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Phone on invoice</label>
              <input className={inputCls} disabled={!canEdit} value={invoice.seller_phone} onChange={(e) => setInv("seller_phone", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>SAC</label>
              <input className={inputCls} maxLength={6} disabled={!canEdit} value={invoice.sac} onChange={(e) => setInv("sac", e.target.value.replace(/\D/g, ""))} />
            </div>
            <div>
              <label className={labelCls}>SAC description</label>
              <input className={inputCls} disabled={!canEdit} value={invoice.sac_description} onChange={(e) => setInv("sac_description", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Invoice number prefix</label>
              <input className={`${inputCls} uppercase`} maxLength={4} disabled={!canEdit} value={invoice.prefix} onChange={(e) => setInv("prefix", e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} />
              <p className="text-[11px] text-slate-500 mt-1">Numbers run per financial year: {invoice.prefix || "DD"}/26-27/000001</p>
            </div>
          </div>
        </Shell>
      )}
    </>
  );
}

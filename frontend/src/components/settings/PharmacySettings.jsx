import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Building2, FileBadge2, Landmark, Lock, QrCode, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { API, useAuth } from "../../App";
import { Button } from "../ui/button";
import UpiQrDialog, { UPI_ID_RE } from "../UpiQr";
import ImageCropField from "./ImageCropField";
import { Field, SectionCard, UpdateBar, uploadStatus } from "./SettingsKit";

const FIELDS = ["name", "location", "license_no", "years_old", "contact", "pan", "bank_name", "bank_ifsc", "bank_acc_no", "bank_holder", "upi_id", "gst_no"];

const FORMATS = {
  gst_no: { re: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, message: "A GSTIN has 15 characters, e.g. 09AAACH1111H1Z1" },
  pan: { re: /^[A-Z]{5}[0-9]{4}[A-Z]$/, message: "A PAN has 10 characters, e.g. EAAPK8941N" },
  bank_ifsc: { re: /^[A-Z]{4}0[A-Z0-9]{6}$/, message: "An IFSC has 11 characters, e.g. SBIN0000637" },
  upi_id: { re: UPI_ID_RE, message: "Should look like name@bank, e.g. medicalstore@okhdfcbank" },
};

const clean = (value) => String(value ?? "").trim();
const toDraft = (pharmacy) => Object.fromEntries(FIELDS.map((key) => [key, pharmacy?.[key] ?? ""]));

export default function PharmacySettings({ active, onDirtyChange }) {
  const { pharmacy, setPharmacy, isAdmin } = useAuth();
  const [draft, setDraft] = useState(() => toDraft(pharmacy));
  const [logoDraft, setLogoDraft] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [logoPercent, setLogoPercent] = useState(null);

  const changedKeys = useMemo(() => FIELDS.filter((key) => clean(draft[key]) !== clean(pharmacy?.[key])), [draft, pharmacy]);
  const changes = changedKeys.length + (logoDraft ? 1 : 0);
  const dirty = changes > 0;

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  // Saved details that arrive later (first load) fill the form unless the user has started editing
  useEffect(() => {
    if (!dirty) setDraft(toDraft(pharmacy));
  }, [pharmacy]);

  // A saved value that's already off-format shouldn't block unrelated edits
  const errorFor = (key) => {
    const value = clean(draft[key]);
    if (!value || !changedKeys.includes(key)) return null;
    return FORMATS[key].re.test(value) ? null : FORMATS[key].message;
  };
  const nameError = clean(draft.name) ? null : "Pharmacy name is required";
  const blocked = !!nameError || Object.keys(FORMATS).some(errorFor);

  const bind = (key, transform = (v) => v) => ({
    value: draft[key],
    disabled: !isAdmin || !!status,
    onChange: (e) => {
      setDraft((prev) => ({ ...prev, [key]: transform(e.target.value) }));
      setError(null);
    },
  });
  const upper = (v) => v.toUpperCase().replace(/\s+/g, "");

  const handleUpdate = async () => {
    setError(null);
    const hasImage = !!logoDraft?.blob;
    setStatus(hasImage ? uploadStatus("logo", 0) : uploadStatus(null, null));
    setLogoPercent(hasImage ? 0 : null);
    try {
      const formData = new FormData();
      FIELDS.forEach((key) => formData.append(key, clean(draft[key])));
      if (hasImage) formData.append("logo", logoDraft.blob, "logo.png");
      if (logoDraft?.removed) formData.append("remove_logo", "true");

      const response = await axios.put(`${API}/pharmacy`, formData, {
        onUploadProgress: (e) => {
          if (!hasImage || !e.total) return;
          const percent = Math.min(100, Math.round((e.loaded / e.total) * 100));
          setLogoPercent(percent);
          setStatus(uploadStatus("logo", percent));
        },
      });
      setPharmacy(response.data.pharmacy);
      setDraft(toDraft(response.data.pharmacy));
      setLogoDraft(null);
      toast.success("Pharmacy details updated");
    } catch (err) {
      const detail = err.response?.data?.detail;
      const message = detail || "We couldn't reach the server, so nothing was saved. Check your connection and try again.";
      setError(message);
      toast.error(message);
    } finally {
      setStatus(null);
      setLogoPercent(null);
    }
  };

  const handleDiscard = () => {
    setDraft(toDraft(pharmacy));
    setLogoDraft(null);
    setError(null);
  };

  const upiDraft = clean(draft.upi_id);
  const upiSaved = clean(pharmacy?.upi_id);

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {!isAdmin && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 border border-border/60 rounded-xl px-4 py-2.5" data-testid="pharmacy-readonly-note">
          <Lock className="w-4 h-4 shrink-0" />
          Only an admin can change these details.
        </p>
      )}

      <SectionCard icon={Building2} title="Pharmacy logo" description="Appears on your bills, purchase notes and in the app.">
        <ImageCropField
          label="Pharmacy logo"
          currentUrl={pharmacy?.logo_url}
          fallback={<Building2 className="w-9 h-9" />}
          fitWhole
          outputType="image/png"
          draft={logoDraft}
          onDraftChange={(next) => {
            setLogoDraft(next);
            setError(null);
          }}
          disabled={!isAdmin}
          busy={!!status && !!logoDraft?.blob}
          percent={logoPercent}
          testId="logo"
        />
      </SectionCard>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <SectionCard icon={Building2} title="Business details" description="How customers see and reach you.">
          <Field label="Pharmacy name" required error={nameError} data-testid="pharmacy-name-input" {...bind("name")} />
          <Field label="Location" data-testid="pharmacy-location-input" {...bind("location")} />
          <div className="grid sm:grid-cols-[1fr_9rem] gap-4">
            <Field label="Contact (email or phone)" placeholder="e.g. 8535085807, name@gmail.com" data-testid="pharmacy-contact-input" {...bind("contact")} />
            <Field label="Years in business" type="number" min="0" inputMode="numeric" data-testid="pharmacy-years-input" {...bind("years_old")} />
          </div>
        </SectionCard>

        <SectionCard icon={FileBadge2} title="Licence and tax" description="Printed on your GST invoices.">
          <Field label="Drug licence number" data-testid="pharmacy-license-input" {...bind("license_no")} />
          <Field label="GST number (GSTIN)" placeholder="e.g. 09AAACH1111H1Z1" autoCapitalize="characters" error={errorFor("gst_no")} data-testid="pharmacy-gst-input" {...bind("gst_no", upper)} />
          <Field label="PAN" placeholder="e.g. EAAPK8941N" autoCapitalize="characters" error={errorFor("pan")} data-testid="pharmacy-pan-input" {...bind("pan", upper)} />
        </SectionCard>

        <SectionCard icon={Landmark} title="Bank account" description="Shown on bills so customers can pay you.">
          <Field label="Bank name and branch" placeholder="e.g. State Bank of India, Faridpur" data-testid="pharmacy-bank-name-input" {...bind("bank_name")} />
          <Field label="Account holder name" data-testid="pharmacy-holder-input" {...bind("bank_holder")} />
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Account number" inputMode="numeric" data-testid="pharmacy-acc-no-input" {...bind("bank_acc_no")} />
            <Field label="IFSC code" placeholder="e.g. SBIN0000637" autoCapitalize="characters" error={errorFor("bank_ifsc")} data-testid="pharmacy-ifsc-input" {...bind("bank_ifsc", upper)} />
          </div>
        </SectionCard>

        <SectionCard icon={Smartphone} title="UPI payments" description="Used for payment QRs on bills and on the Billing page.">
          <Field
            label="UPI ID"
            placeholder="e.g. q201486073@ybl"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            error={errorFor("upi_id")}
            data-testid="pharmacy-upi-input"
            {...bind("upi_id", (v) => v.replace(/\s+/g, ""))}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => setQrOpen(true)}
            disabled={!upiSaved || upiDraft !== upiSaved}
            title={!upiSaved ? "Save a UPI ID first" : upiDraft !== upiSaved ? "Press Update first" : "Make a payment QR for any amount"}
            className="w-full"
            data-testid="generate-upi-qr-btn"
          >
            <QrCode className="w-4 h-4 mr-1.5" />
            Generate QR
          </Button>
        </SectionCard>
      </div>

      {isAdmin && (
        <UpdateBar
          active={active}
          changes={changes}
          blocked={blocked}
          status={status}
          error={error}
          onUpdate={handleUpdate}
          onDiscard={handleDiscard}
          testId="save-pharmacy-btn"
        />
      )}

      <UpiQrDialog open={qrOpen} onOpenChange={setQrOpen} />
    </div>
  );
}

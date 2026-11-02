import { useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Eye, FileText, Loader2, Paperclip, ShieldAlert, X } from "lucide-react";
import { API } from "../../App";
import { compressForScan } from "../scan/scanClient";

const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// Opens a prescription in a new tab through a short-lived S3 link from the API
export async function openPrescription(id) {
  const win = window.open("", "_blank");
  try {
    const { data } = await axios.get(`${API}/bills/prescriptions/${id}`);
    if (win) {
      win.opener = null;
      win.location.href = data.url;
    } else {
      // Pop-up blocked: a plain link still opens it without leaving the bill
      const a = document.createElement("a");
      a.href = data.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    }
  } catch {
    win?.close();
    toast.error("Couldn't open the prescription");
  }
}

// Prescription for a bill with Schedule H1 medicines: required before saving.
// `value` is { id, name, mime, size } once uploaded.
export default function PrescriptionAttach({ h1Items = [], value, onChange, inputId = "rx-attach" }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  if (!h1Items.length && !value) return null;
  const missing = h1Items.length > 0 && !value;

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^(application\/pdf|image\/)/.test(file.type)) return toast.error("Attach a PDF or a photo of the prescription");
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file.type.startsWith("image/") ? await compressForScan(file, { maxSide: 2000, quality: 0.85 }) : file);
      const res = await axios.post(`${API}/bills/prescriptions`, body);
      onChange(res.data.prescription);
      toast.success("Prescription attached");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't upload the prescription");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      data-testid="rx-card"
      className={`rounded-2xl border p-3 sm:p-4 ${missing ? "border-violet-500/40 bg-violet-500/5" : "border-emerald-500/40 bg-emerald-500/5"}`}
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert className={`w-5 h-5 mt-0.5 shrink-0 ${missing ? "text-violet-600 dark:text-violet-400" : "text-emerald-500"}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">
            Prescription {missing ? <span className="text-violet-700 dark:text-violet-300">required</span> : <span className="text-emerald-600 dark:text-emerald-400">attached</span>}
          </p>
          {h1Items.length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Schedule H1: <span className="font-semibold text-foreground">{h1Items.join(", ")}</span>. The prescription is saved with the bill.
            </p>
          )}
          {value ? (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-border bg-background px-2 py-1 max-w-full">
                <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="truncate max-w-[180px]">{value.name}</span>
                <span className="text-muted-foreground">{kb(value.size || 0)}</span>
              </span>
              <button type="button" onClick={() => openPrescription(value.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                <Eye className="w-3.5 h-3.5" /> View
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
                Replace
              </button>
              <button type="button" onClick={() => onChange(null)} aria-label="Remove prescription" className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              id={inputId}
              type="button"
              data-testid="rx-attach"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="mt-2 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
              {uploading ? "Uploading…" : "Attach prescription (PDF or photo)"}
            </button>
          )}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={pick} data-testid="rx-file" />
    </div>
  );
}

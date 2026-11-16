// Catalog products with details still missing (salt, company, HSN, GST, MRP,
// pack size). Pick which details count; fix each one by hand (Edit), let AI
// fill salt / company / pack (checked before saving), or ask DavaDesk AI.
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Loader2, Sparkles } from "lucide-react";
import { API } from "../App";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

const FIELDS = [
  ["salt", "Salt"],
  ["manufacturer", "Company"],
  ["hsn", "HSN"],
  ["gst", "GST"],
  ["mrp", "MRP"],
  ["pack", "Pack size"],
];
const LABEL = Object.fromEntries(FIELDS);
const PREF_KEY = "davadesk_missing_fields";

export default function MissingDetailsDialog({ open, onOpenChange, onEdit, canEdit = true }) {
  const navigate = useNavigate();
  const [fields, setFields] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem(PREF_KEY) || "null");
      return Array.isArray(v) && v.length ? v : ["salt"];
    } catch {
      return ["salt"];
    }
  });
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");
  const [proposal, setProposal] = useState({}); // id -> AI answer waiting for OK

  const load = useCallback(async () => {
    setData(null);
    try {
      const res = await axios.get(`${API}/products/missing`, { params: { fields: fields.join(",") } });
      setData(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't load the list");
      setData({ products: [], total: 0 });
    }
  }, [fields]);
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const toggle = (f) => {
    const next = fields.includes(f) ? fields.filter((x) => x !== f) : [...fields, f];
    if (!next.length) return;
    setFields(next);
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(next));
    } catch {}
  };

  const aiFill = async (p) => {
    setBusy(p.id);
    try {
      const res = await axios.post(`${API}/medicines/enrich`, { product_name: p.name || p.product_name });
      const a = res.data || {};
      if (!a.salt_composition && !a.manufacturer) toast.info(`AI couldn't find ${p.name}. Edit it by hand.`);
      else setProposal((m) => ({ ...m, [p.id]: a }));
    } catch {
      toast.error("AI fill failed");
    } finally {
      setBusy("");
    }
  };
  const saveProposal = async (p) => {
    const a = proposal[p.id];
    if (!a) return;
    setBusy(p.id);
    try {
      const patch = {};
      if (a.salt_composition && !String(p.salt_composition || "").trim()) patch.salt_composition = a.salt_composition;
      if (a.manufacturer && !String(p.manufacturer || "").trim()) patch.manufacturer = a.manufacturer;
      if (Number(a.units_per_pack) > 1 && !(Number(p.units_per_pack) > 1)) patch.units_per_pack = Number(a.units_per_pack);
      if (a.pack_type && !p.pack_type) patch.pack_type = a.pack_type;
      await axios.put(`${API}/products/${p.id}`, patch);
      toast.success(`${p.name} updated`);
      setProposal((m) => {
        const n = { ...m };
        delete n[p.id];
        return n;
      });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't save");
    } finally {
      setBusy("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-2xl p-5" data-testid="missing-details-dialog">
        <DialogHeader>
          <DialogTitle className="text-base font-black">Products with missing details</DialogTitle>
          <DialogDescription className="text-xs">Choose which details to check. Medicines only (cosmetics and devices usually have no salt).</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {FIELDS.map(([f, l]) => (
            <button
              key={f}
              type="button"
              aria-pressed={fields.includes(f)}
              onClick={() => toggle(f)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${fields.includes(f) ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
            >
              {l}
            </button>
          ))}
          {data && <span className="ml-auto self-center text-xs font-semibold text-muted-foreground">{data.total} product{data.total === 1 ? "" : "s"}</span>}
        </div>
        {!data ? (
          <div className="py-8 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : data.products.length === 0 ? (
          <p className="py-8 text-center text-sm font-semibold text-muted-foreground">Nothing missing</p>
        ) : (
          <div className="max-h-[55vh] divide-y divide-border/50 overflow-y-auto">
            {data.products.map((p) => (
              <div key={p.id} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{p.name || p.product_name}</p>
                    <p className="text-[11px] text-rose-600 dark:text-rose-400">Missing: {p.missing.map((m) => LABEL[m]).join(", ")}</p>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      {(p.missing.includes("salt") || p.missing.includes("manufacturer") || p.missing.includes("pack")) && (
                        <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => aiFill(p)} className="h-7 rounded-lg px-2 text-[11px] font-bold" data-testid="missing-ai-fill">
                          {busy === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />} AI fill
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          onOpenChange(false);
                          navigate("/assistant", { state: { prompt: `What is the salt composition, manufacturer and pack size of ${p.name}?` } });
                        }}
                        className="h-7 rounded-lg px-2 text-[11px] font-bold"
                        title="Ask DavaDesk AI about this product"
                      >
                        Ask AI
                      </Button>
                      <Button size="sm" onClick={() => onEdit?.(p)} className="h-7 rounded-lg px-2 text-[11px] font-bold">
                        Edit
                      </Button>
                    </div>
                  )}
                </div>
                {proposal[p.id] && (
                  <div className="mt-1.5 rounded-lg border border-violet-500/30 bg-violet-500/5 p-2 text-[11px]">
                    <p>
                      <b>AI suggests:</b> {proposal[p.id].salt_composition || "—"} · {proposal[p.id].manufacturer || "—"}
                      {proposal[p.id].units_per_pack ? ` · ${proposal[p.id].units_per_pack} per ${proposal[p.id].pack_type || "pack"}` : ""}
                    </p>
                    <div className="mt-1 flex gap-1.5">
                      <Button size="sm" disabled={busy === p.id} onClick={() => saveProposal(p)} className="h-6 rounded-md px-2 text-[10px] font-bold">
                        Looks right, save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setProposal((m) => {
                            const n = { ...m };
                            delete n[p.id];
                            return n;
                          })
                        }
                        className="h-6 rounded-md px-2 text-[10px] font-bold"
                      >
                        Discard
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

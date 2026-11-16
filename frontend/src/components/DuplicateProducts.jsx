// Medicines that look like one product saved under different names
// ("calpol 650" / "Calpol 650"): review each group and merge it into one name.
// Used in Inventory and next to the purchase entry.
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";
import { API } from "../App";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

export function useDuplicateCount(enabled = true) {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await axios.get(`${API}/inventory/duplicates`);
      setCount(res.data.count || 0);
    } catch {
      setCount(0);
    }
  }, [enabled]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return [count, refresh];
}

export default function DuplicateProductsDialog({ open, onOpenChange, onMerged, name = "" }) {
  const [groups, setGroups] = useState(null);
  const [names, setNames] = useState({}); // key -> chosen name
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/inventory/duplicates`, { params: name ? { name } : {} });
      setGroups(res.data.groups || []);
      setNames(Object.fromEntries((res.data.groups || []).map((g) => [g.key, g.suggested_name])));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't check for duplicates");
      setGroups([]);
    }
  }, [name]);
  useEffect(() => {
    if (open) {
      setGroups(null);
      load();
    }
  }, [open, load]);

  const merge = async (g) => {
    const target = (names[g.key] || g.suggested_name).trim();
    if (!target) return toast.error("Choose the name to keep");
    const pick = g.names.find((n) => n.name === target) || g.names[0];
    setBusy(g.key);
    try {
      await axios.post(`${API}/inventory/merge`, {
        inventory_ids: g.inventory_ids,
        merged_name: target,
        merged_manufacturer: pick.manufacturer || "",
        merged_salt: pick.salt_composition || "",
        merged_hsn: pick.hsn_no || "",
      });
      toast.success(`Merged into "${target}"`);
      setGroups((list) => (list || []).filter((x) => x.key !== g.key));
      onMerged?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't merge");
    } finally {
      setBusy("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-2xl p-5" data-testid="duplicates-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-black">
            <Copy className="h-4 w-4 text-amber-500" /> Same medicine, different names
          </DialogTitle>
          <DialogDescription className="text-xs">
            These names differ only in spacing, case or punctuation. Merge each group into one name: all batches, purchases and bills move to it.
          </DialogDescription>
        </DialogHeader>
        {groups === null ? (
          <div className="py-8 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : groups.length === 0 ? (
          <p className="py-8 text-center text-sm font-semibold text-muted-foreground">No duplicate names found</p>
        ) : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {groups.map((g) => (
              <div key={g.key} className="rounded-xl border border-border/70 p-3">
                <div className="space-y-1">
                  {g.names.map((n) => (
                    <label key={n.name} className="flex cursor-pointer items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-2">
                        <input type="radio" name={`dup-${g.key}`} checked={(names[g.key] || g.suggested_name) === n.name} onChange={() => setNames((m) => ({ ...m, [g.key]: n.name }))} />
                        <b>{n.name}</b>
                      </span>
                      <span className="text-muted-foreground">
                        {n.batches} batch{n.batches === 1 ? "" : "es"} · {n.stock} units
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">Keep the ticked name</span>
                  <Button size="sm" disabled={busy === g.key} onClick={() => merge(g)} className="h-8 rounded-lg text-xs font-bold" data-testid="merge-duplicates">
                    {busy === g.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Merge"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

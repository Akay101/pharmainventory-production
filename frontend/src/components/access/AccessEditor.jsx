// Tree editor for a pharmacist's access: presets, then each module with its
// actions (view / create / edit / delete), then rules that block behaviours,
// then which pharmacies they may open. The server enforces all of it.
import { useState } from "react";
import { Building2, Check, ChevronRight, Minus, ShieldBan, Sparkles } from "lucide-react";
import { Switch } from "../ui/switch";

const ACTION_LABEL = { read: "View", create: "Create", update: "Edit", delete: "Delete" };

function TriBox({ state, onClick, label }) {
  // state: "all" | "some" | "none"
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "all" ? "true" : state === "some" ? "mixed" : "false"}
      aria-label={label}
      onClick={onClick}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
        state === "none" ? "border-border bg-background" : "border-orange-500 bg-orange-500 text-white"
      }`}
    >
      {state === "all" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : state === "some" ? <Minus className="h-3.5 w-3.5" strokeWidth={3} /> : null}
    </button>
  );
}

export const emptyPermissions = (schema) => ({
  preset: "CUSTOM",
  modules: Object.fromEntries(schema.modules.map((m) => [m.key, Object.fromEntries(m.actions.map((a) => [a, false]))])),
  restrictions: {},
  pharmacies: "ALL",
});

export const fromPreset = (schema, key) => {
  const p = schema.presets.find((x) => x.key === key);
  return p ? { preset: key, modules: JSON.parse(JSON.stringify(p.modules)), restrictions: { ...(p.restrictions || {}) }, pharmacies: "ALL" } : emptyPermissions(schema);
};

// "Billing (view, create) · Customers (view) · 2 rules"
export function accessSummary(schema, perms) {
  if (!perms) return "Full access";
  const parts = schema.modules
    .map((m) => {
      const acts = m.actions.filter((a) => perms.modules?.[m.key]?.[a]);
      if (!acts.length) return null;
      return acts.length === m.actions.length ? m.label : `${m.label} (${acts.map((a) => ACTION_LABEL[a].toLowerCase()).join(", ")})`;
    })
    .filter(Boolean);
  const rules = Object.values(perms.restrictions || {}).filter((v) => v === true || typeof v === "number").length;
  return `${parts.length ? parts.join(" · ") : "No modules"}${rules ? ` · ${rules} rule${rules === 1 ? "" : "s"}` : ""}`;
}

export default function AccessEditor({ schema, value, onChange }) {
  const [open, setOpen] = useState(() => new Set(schema.modules.filter((m) => m.actions.some((a) => value.modules?.[m.key]?.[a])).map((m) => m.key)));
  const set = (next) => onChange({ ...value, ...next, preset: next.preset || "CUSTOM" });

  const toggleAction = (mod, action) => {
    const cur = { ...(value.modules[mod.key] || {}) };
    cur[action] = !cur[action];
    if (action !== "read" && cur[action]) cur.read = true;
    if (action === "read" && !cur.read) for (const a of mod.actions) cur[a] = false;
    set({ modules: { ...value.modules, [mod.key]: cur } });
  };
  const stateOf = (mod) => {
    const on = mod.actions.filter((a) => value.modules?.[mod.key]?.[a]).length;
    return on === 0 ? "none" : on === mod.actions.length ? "all" : "some";
  };
  const toggleModule = (mod) => {
    const all = stateOf(mod) !== "all";
    set({ modules: { ...value.modules, [mod.key]: Object.fromEntries(mod.actions.map((a) => [a, all])) } });
  };
  const toggleOpen = (key) =>
    setOpen((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const allPharmacies = value.pharmacies === "ALL";
  const picked = allPharmacies ? schema.pharmacies.map((p) => p.id) : value.pharmacies || [];

  return (
    <div className="space-y-4" data-testid="access-editor">
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5" /> Start from
        </p>
        <div className="flex flex-wrap gap-1.5">
          {schema.presets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange({ ...fromPreset(schema, p.key), pharmacies: value.pharmacies })}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${value.preset === p.key ? "border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-300" : "border-border hover:bg-muted/50"}`}
              data-testid={`preset-${p.key}`}
            >
              {p.label}
            </button>
          ))}
          {value.preset === "CUSTOM" && <span className="rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-bold text-muted-foreground">Custom</span>}
        </div>
      </div>

      <div className="rounded-2xl border border-border overflow-hidden">
        <p className="bg-muted/40 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Modules and actions</p>
        <ul className="divide-y divide-border/70">
          {schema.modules.map((m) => {
            const isOpen = open.has(m.key);
            return (
              <li key={m.key} data-testid={`module-${m.key}`}>
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <button type="button" onClick={() => toggleOpen(m.key)} className="p-0.5 rounded hover:bg-muted" aria-label={isOpen ? "Collapse" : "Expand"} aria-expanded={isOpen}>
                    <ChevronRight className={`w-4 h-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                  </button>
                  <TriBox state={stateOf(m)} onClick={() => toggleModule(m)} label={m.label} />
                  <button type="button" onClick={() => toggleOpen(m.key)} className="min-w-0 flex-1 text-left">
                    <span className="block text-sm font-bold">{m.label}</span>
                    <span className="block truncate text-[11px] font-semibold text-muted-foreground">{m.hint}</span>
                  </button>
                </div>
                {isOpen && (
                  <div className="flex flex-wrap gap-1.5 pb-3 pl-[4.25rem] pr-3">
                    {m.actions.map((a) => {
                      const on = !!value.modules?.[m.key]?.[a];
                      return (
                        <button
                          key={a}
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          onClick={() => toggleAction(m, a)}
                          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition ${on ? "border-orange-500/60 bg-orange-500/10 text-orange-700 dark:text-orange-300" : "border-border text-muted-foreground hover:bg-muted/50"}`}
                          data-testid={`action-${m.key}-${a}`}
                        >
                          <span className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${on ? "border-orange-500 bg-orange-500 text-white" : "border-border"}`}>{on && <Check className="h-2.5 w-2.5" strokeWidth={3} />}</span>
                          {ACTION_LABEL[a]}
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-2xl border border-border overflow-hidden">
        <p className="flex items-center gap-1.5 bg-muted/40 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
          <ShieldBan className="w-3.5 h-3.5" /> Rules
        </p>
        <ul className="divide-y divide-border/70">
          {schema.restrictions.map((r) => (
            <li key={r.key} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{r.label}</p>
                <p className="text-[11px] font-semibold text-muted-foreground">{r.hint}</p>
              </div>
              {r.type === "boolean" ? (
                <Switch checked={!!value.restrictions?.[r.key]} onCheckedChange={(v) => set({ restrictions: { ...value.restrictions, [r.key]: v } })} data-testid={`rule-${r.key}`} />
              ) : (
                <input
                  type="number"
                  min={r.min}
                  max={r.max}
                  placeholder="No limit"
                  value={value.restrictions?.[r.key] ?? ""}
                  onChange={(e) => set({ restrictions: { ...value.restrictions, [r.key]: e.target.value === "" ? null : Math.max(r.min, Math.min(r.max, Number(e.target.value))) } })}
                  className="h-9 w-24 rounded-lg border border-border bg-background px-2 text-right text-sm font-bold"
                  data-testid={`rule-${r.key}`}
                />
              )}
            </li>
          ))}
        </ul>
      </div>

      {schema.pharmacies.length > 1 && (
        <div className="rounded-2xl border border-border overflow-hidden">
          <p className="flex items-center gap-1.5 bg-muted/40 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
            <Building2 className="w-3.5 h-3.5" /> Pharmacies
          </p>
          <div className="space-y-1 p-3">
            <label className="flex items-center gap-2.5 py-1 text-sm font-bold">
              <Switch checked={allPharmacies} onCheckedChange={(v) => set({ pharmacies: v ? "ALL" : schema.pharmacies.map((p) => p.id) })} />
              All pharmacies, including ones linked later
            </label>
            {!allPharmacies &&
              schema.pharmacies.map((p) => {
                const on = picked.includes(p.id);
                return (
                  <label key={p.id} className="flex items-center gap-2.5 py-1 pl-1 text-sm font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-orange-500"
                      checked={on}
                      onChange={() => {
                        const next = on ? picked.filter((x) => x !== p.id) : [...picked, p.id];
                        if (next.length) set({ pharmacies: next });
                      }}
                    />
                    {p.name}
                    {p.primary && <span className="text-[11px] text-muted-foreground">(main)</span>}
                  </label>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

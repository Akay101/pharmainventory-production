import { useRef } from "react";
import { AlertTriangle, Check, PackagePlus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Kbd } from "../shortcuts/Shortcuts";

const sourceLabel = (s) => (s.source === "global" ? "Global catalog" : "Your inventory");

// Save with products nobody picked from the suggestions (the "warning" setting):
// they become new catalog entries with what was typed. Show the closest products
// we already hold so a duplicate is one key away from being avoided.
// Enter saves as new, 1-9 uses that match, Esc goes back to the form.
export default function NewProductsDialog({ rows, onPick, onSave, onCancel }) {
  const saveRef = useRef(null);
  const open = !!rows?.length;
  // Numbered across all rows, so each match has its own key
  const numbered = [];
  (rows || []).forEach((r) => r.suggestions.forEach((s) => numbered.push({ row: r, s })));

  const onKeyDown = (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= Math.min(9, numbered.length)) {
      e.preventDefault();
      const { row, s } = numbered[n - 1];
      onPick(row, s);
    }
  };

  let k = 0;
  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent
        data-testid="new-products-dialog"
        className="max-w-xl"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          saveRef.current?.focus();
        }}
        onKeyDown={onKeyDown}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber-500 max-sm:justify-center">
            <AlertTriangle className="h-5 w-5" />
            {rows?.length === 1 ? "New product will be added to inventory" : `${rows?.length || 0} new products will be added to inventory`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {rows?.length === 1 ? "It wasn't" : "They weren't"} picked from the suggestions, so a new product catalog is
            created with the details you entered. If one of these is the same product, use it instead to avoid a duplicate.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          {(rows || []).map((r) => (
            <div key={r.id} className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                <PackagePlus className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                <span className="min-w-0 truncate">{r.product_name}</span>
              </p>
              {r.suggestions.length ? (
                <div className="mt-2 space-y-1.5">
                  <p className="text-[11px] font-semibold text-muted-foreground">Closest matches</p>
                  {r.suggestions.map((s) => {
                    k += 1;
                    const key = k;
                    return (
                      <button
                        key={`${s.source}-${s.product_id}`}
                        type="button"
                        data-testid="new-product-match"
                        onClick={() => onPick(r, s)}
                        className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-left text-xs transition-colors hover:border-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer"
                      >
                        {key <= 9 && <Kbd combo={String(key)} className="max-md:hidden" />}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold text-foreground">{s.product_name}</span>
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {sourceLabel(s)}
                            {s.manufacturer ? ` · ${s.manufacturer}` : ""}
                            {s.same_salt && s.salt_composition ? ` · Same salt: ${s.salt_composition}` : ""}
                          </span>
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-1.5 py-1 text-[10px] font-bold leading-none text-primary-foreground">
                          <Check className="h-3 w-3" aria-hidden="true" /> Use
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">No close match in your inventory or the global catalog.</p>
              )}
            </div>
          ))}
        </div>

        <p className="hidden text-[11px] text-muted-foreground md:flex md:items-center md:gap-1.5">
          <Kbd combo="enter" /> save as new
          {numbered.length > 0 && (
            <>
              <span className="mx-1">·</span>
              <Kbd combo={numbered.length > 1 ? `1-${Math.min(9, numbered.length)}` : "1"} /> use match
            </>
          )}
          <span className="mx-1">·</span>
          <Kbd combo="escape" /> back
        </p>

        <AlertDialogFooter>
          <AlertDialogCancel className="mt-0">Go back</AlertDialogCancel>
          <Button ref={saveRef} data-shortcut="save" data-testid="new-products-save" onClick={onSave}>
            Save as new {rows?.length === 1 ? "product" : "products"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

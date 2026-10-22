import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import BillingScanWorkspace from "./scan/BillingScanWorkspace";
import { AiMark } from "./scan/ScanUI";

// Scan medicine packs from the billing screen and add them to the open bill
export default function BillingScannerModal({ open, onOpenChange, onTransferToBill }) {
  const [lines, setLines] = useState([]);
  const [session, setSession] = useState(0);

  const total = lines.reduce((s, l) => s + (Number(l.mrp) || 0) * (Number(l.quantity) || 0), 0);

  const transfer = () => {
    if (!lines.length) {
      toast.error("Scan at least one product first");
      return;
    }
    onTransferToBill(lines);
    toast.success(`Added ${lines.length} product${lines.length > 1 ? "s" : ""} to the bill`);
    onOpenChange(false);
    setSession((s) => s + 1); // fresh workspace next time
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[96vw] max-h-[92vh] p-0 gap-0 flex flex-col overflow-hidden rounded-2xl border-border bg-background">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
          <AiMark />
          <div className="min-w-0">
            <DialogTitle className="text-base font-bold">Scan products</DialogTitle>
            <DialogDescription className="text-xs">Photo of the pack: batch first, then name, matched to your stock.</DialogDescription>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <BillingScanWorkspace key={session} onLinesChange={setLines} />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-card/80 px-4 py-3 sm:px-5 backdrop-blur">
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{lines.length}</span> ready · ₹{total.toFixed(2)}
          </div>
          <button
            type="button"
            onClick={transfer}
            disabled={!lines.length}
            className="h-10 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-40 active:scale-[0.99]"
          >
            Add to bill <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

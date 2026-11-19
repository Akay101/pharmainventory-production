import { useSearchParams } from "react-router-dom";
import { Undo2, Truck, ArrowRight, ReceiptText, ArrowLeftRight } from "lucide-react";
import ReturnNotesPage from "../components/returns/ReturnNotesPage";
import SalesReturnsPage from "../components/returns/SalesReturnsPage";
import { Button } from "../components/ui/button";

const CHOICES = [
  {
    view: "sales",
    title: "Sales returns",
    text: "A customer brings medicines back. Return some items or the whole bill, put stock back, and refund or take it off their dues.",
    icon: ReceiptText,
    tone: "text-teal-600 bg-teal-500/10 border-teal-500/30",
    cta: "bg-teal-600 hover:bg-teal-700",
  },
  {
    view: "purchase",
    title: "Purchase returns",
    text: "Send unexpired stock back to a supplier with a return note, and track the credit they owe you.",
    icon: Truck,
    tone: "text-orange-600 bg-orange-500/10 border-orange-500/30",
    cta: "bg-primary hover:bg-primary/90",
  },
];

// Returns: first ask which kind; the choice stays in the URL (?view=)
export default function ReturnsPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view");
  const go = (v) => setParams(v ? { view: v } : {}, { replace: false });

  if (view === "sales") return <SalesReturnsPage onSwitch={() => go("purchase")} />;
  if (view === "purchase") {
    return (
      <div className="space-y-2">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => go("sales")} className="h-8 rounded-xl text-xs font-bold" data-testid="switch-to-sales-returns">
            <ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" />
            Sales returns
          </Button>
        </div>
        <ReturnNotesPage kind="return" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div className="flex items-center gap-2.5 pb-2 border-b border-border/60">
        <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-500 shrink-0">
          <Undo2 className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">Returns</h1>
          <p className="text-xs font-semibold text-muted-foreground">What would you like to work on?</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
        {CHOICES.map((c) => (
          <button
            key={c.view}
            type="button"
            onClick={() => go(c.view)}
            className="group text-left p-5 rounded-2xl border border-border/70 bg-card/60 hover:border-foreground/30 hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid={`returns-choose-${c.view}`}
          >
            <div className={`inline-flex p-3 rounded-xl border ${c.tone}`}>
              <c.icon className="w-6 h-6" />
            </div>
            <h2 className="mt-4 text-lg font-black text-foreground">{c.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground leading-snug">{c.text}</p>
            <span className={`mt-4 inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-white text-xs font-bold ${c.cta}`}>
              View or create
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

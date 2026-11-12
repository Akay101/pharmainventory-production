// Shown instead of a page the user's access doesn't cover: says what is
// missing, who decides, lets them ask the owner in one tap, and offers what
// they can open instead.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { ArrowLeft, BellRing, CalendarX, Check, ClipboardList, Home, Loader2, Lock, Package, PackageCheck, Receipt, RotateCcw, ShieldCheck, ShoppingCart, Truck, Users } from "lucide-react";
import { API, useAuth } from "../../App";
import { Button } from "../ui/button";

export const SECTION = {
  dashboard: "Dashboard & reports",
  billing: "Billing",
  purchases: "Purchases",
  inventory: "Inventory",
  customers: "Customers",
  suppliers: "Suppliers",
  returns: "Returns",
  expiry: "Expiry",
  short_book: "Short book",
  restock: "Restock & reminders",
  assistant: "DavaDesk AI",
  imports: "Data import",
  settings: "Pharmacy settings",
  activities: "Activity log",
  users: "Users",
};
const VERB = { read: "open", create: "add to", update: "edit", delete: "delete from" };

const SHORTCUTS = [
  { module: "billing", path: "/billing", label: "Billing", icon: Receipt },
  { module: "inventory", path: "/inventory", label: "Inventory", icon: Package },
  { module: "purchases", path: "/purchases", label: "Purchases", icon: ShoppingCart },
  { module: "customers", path: "/customers", label: "Customers", icon: Users },
  { module: "suppliers", path: "/suppliers", label: "Suppliers", icon: Truck },
  { module: "expiry", path: "/expiry", label: "Expiry", icon: CalendarX },
  { module: "returns", path: "/returns", label: "Returns", icon: RotateCcw },
  { module: "short_book", path: "/short-book", label: "Short book", icon: ClipboardList },
  { module: "restock", path: "/restock", label: "Restock", icon: PackageCheck },
];

export default function NoAccessPage({ module, action = "read", path }) {
  const { can, pharmacy } = useAuth();
  const navigate = useNavigate();
  const [owner, setOwner] = useState(null);
  const [state, setState] = useState("idle"); // idle | sending | sent
  const section = SECTION[module] || "this page";

  useEffect(() => {
    let alive = true;
    axios
      .get(`${API}/account/owner`)
      .then((r) => alive && setOwner(r.data?.name || null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const ask = async () => {
    setState("sending");
    try {
      const r = await axios.post(`${API}/account/access-request`, { module, action, path });
      toast.success(r.data.message);
      setState("sent");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't send the request");
      setState("idle");
    }
  };

  const others = SHORTCUTS.filter((s) => s.module !== module && can(s.module, "read")).slice(0, 6);
  const who = owner ? owner.split(" ")[0] : "the pharmacy owner";

  return (
    <div className="relative mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-4 py-10 text-center animate-fade-in" data-testid="no-access-page">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-6 mx-auto h-64 w-64 rounded-full bg-orange-500/10 blur-3xl" />
      <div className="relative mb-6">
        <div className="flex h-24 w-24 items-center justify-center rounded-[2rem] bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-xl shadow-orange-500/25 rotate-3">
          <Lock className="h-10 w-10 -rotate-3" strokeWidth={2.4} />
        </div>
        <span className="absolute -bottom-2 -right-2 flex h-10 w-10 items-center justify-center rounded-2xl border-4 border-background bg-card text-orange-600 shadow">
          <ShieldCheck className="h-5 w-5" />
        </span>
      </div>

      <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.2em] text-orange-600">Access needed</p>
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
        Sorry, you can't {VERB[action] || "open"} {section}
      </h1>
      <p className="mt-3 max-w-md text-base font-medium text-muted-foreground">
        Your access in {pharmacy?.name || "this pharmacy"} doesn't include this. {owner ? `${owner} decides` : "The pharmacy owner decides"} what each user can see and do; ask them if you need it.
      </p>

      <div className="mt-7 flex w-full flex-col justify-center gap-2.5 sm:w-auto sm:flex-row">
        <Button onClick={ask} disabled={state !== "idle"} className="h-12 rounded-xl px-6 font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-lg shadow-orange-500/20" data-testid="request-access-btn">
          {state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : state === "sent" ? <><Check className="mr-2 h-4 w-4" /> Request sent to {who}</> : <><BellRing className="mr-2 h-4 w-4" /> Ask {who} for access</>}
        </Button>
        <Button variant="outline" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/dashboard"))} className="h-12 rounded-xl px-5 font-bold">
          <ArrowLeft className="mr-2 h-4 w-4" /> Go back
        </Button>
        <Button variant="ghost" asChild className="h-12 rounded-xl px-5 font-bold">
          <Link to="/dashboard">
            <Home className="mr-2 h-4 w-4" /> Home
          </Link>
        </Button>
      </div>

      {others.length > 0 && (
        <div className="mt-12 w-full">
          <p className="mb-3 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">You can open</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {others.map((s) => (
              <Link key={s.path} to={s.path} className="group flex items-center gap-3 rounded-2xl border border-border bg-card/70 p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-orange-500/40 hover:shadow-md">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600">
                  <s.icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-bold">{s.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

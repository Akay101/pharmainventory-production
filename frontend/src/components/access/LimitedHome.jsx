// Home page for pharmacists without access to the dashboard's figures:
// shortcuts to what they can use.
import { Link } from "react-router-dom";
import { CalendarX, ClipboardList, Package, PackageCheck, Receipt, RotateCcw, ShoppingCart, Truck, Users } from "lucide-react";
import { useAuth } from "../../App";

const TILES = [
  { module: "billing", action: "create", path: "/billing", label: "New bill", icon: Receipt },
  { module: "billing", action: "read", path: "/billing", label: "Bills", icon: Receipt },
  { module: "purchases", action: "read", path: "/purchases", label: "Purchases", icon: ShoppingCart },
  { module: "inventory", action: "read", path: "/inventory", label: "Inventory", icon: Package },
  { module: "customers", action: "read", path: "/customers", label: "Customers", icon: Users },
  { module: "suppliers", action: "read", path: "/suppliers", label: "Suppliers", icon: Truck },
  { module: "expiry", action: "read", path: "/expiry", label: "Expiry", icon: CalendarX },
  { module: "returns", action: "read", path: "/returns", label: "Returns", icon: RotateCcw },
  { module: "short_book", action: "read", path: "/short-book", label: "Short book", icon: ClipboardList },
  { module: "restock", action: "read", path: "/restock", label: "Restock", icon: PackageCheck },
];

export default function LimitedHome() {
  const { user, pharmacy, can } = useAuth();
  const seen = new Set();
  const tiles = TILES.filter((t) => {
    if (!can(t.module, t.action) || seen.has(t.path)) return false;
    seen.add(t.path);
    return true;
  });
  return (
    <div className="space-y-6 animate-fade-in" data-testid="limited-home">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Hello, {String(user?.name || "").split(" ")[0] || "there"}</h1>
        <p className="text-muted-foreground">You're working in {pharmacy?.name || "your pharmacy"}. Here's what you can open.</p>
      </div>
      {tiles.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {tiles.map((t) => (
            <Link key={t.path + t.label} to={t.path} className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
              <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600">
                <t.icon className="w-5 h-5" />
              </span>
              <span className="font-bold">{t.label}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm font-semibold text-muted-foreground">
          You don't have access to any section yet. Ask the pharmacy owner to set up your access.
        </p>
      )}
    </div>
  );
}

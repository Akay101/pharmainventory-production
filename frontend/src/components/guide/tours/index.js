import { LayoutDashboard, Receipt, ShoppingCart, Package, Users, Truck, BarChart3, Bot, ScanLine, Settings, Undo2, ClipboardList, RefreshCw, UserCog, LifeBuoy } from "lucide-react";
import billing from "./billing";

// Tours that are ready to play, by id
export const TOURS = {
  billing,
};

// Every module, in the order the hub lists them. Ones without a tour yet
// show as "coming soon".
export const TOUR_LIST = [
  { id: "billing", icon: Receipt, title: { en: "Billing", hi: "बिलिंग" } },
  { id: "purchases", icon: ShoppingCart, title: { en: "Purchases", hi: "ख़रीद (Purchases)" } },
  { id: "inventory", icon: Package, title: { en: "Inventory", hi: "स्टॉक (Inventory)" } },
  { id: "dashboard", icon: LayoutDashboard, title: { en: "Dashboard", hi: "डैशबोर्ड" } },
  { id: "customers", icon: Users, title: { en: "Customers", hi: "ग्राहक (Customers)" } },
  { id: "suppliers", icon: Truck, title: { en: "Suppliers", hi: "सप्लायर (Suppliers)" } },
  { id: "returns", icon: Undo2, title: { en: "Returns & expiry", hi: "रिटर्न और एक्सपायरी" } },
  { id: "short-book", icon: ClipboardList, title: { en: "Short book & restock", hi: "शॉर्ट बुक और रीस्टॉक" } },
  { id: "reports", icon: BarChart3, title: { en: "Reports", hi: "रिपोर्ट्स" } },
  { id: "assistant", icon: Bot, title: { en: "AI Assistant", hi: "AI असिस्टेंट" } },
  { id: "scanner", icon: ScanLine, title: { en: "Scanner", hi: "स्कैनर" } },
  { id: "settings", icon: Settings, title: { en: "Settings", hi: "सेटिंग्स" } },
  { id: "users", icon: UserCog, title: { en: "Users & roles", hi: "यूज़र और रोल" } },
  { id: "sync", icon: RefreshCw, title: { en: "Sync Center (desktop)", hi: "सिंक सेंटर (डेस्कटॉप)" } },
  { id: "support", icon: LifeBuoy, title: { en: "Support", hi: "सपोर्ट" } },
];

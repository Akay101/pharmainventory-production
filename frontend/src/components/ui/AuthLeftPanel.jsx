import React from "react";
import {
  Check,
  ScanLine,
  Receipt,
  CalendarClock,
  Package,
  Users,
  FileBarChart,
  TrendingUp,
  MessageCircle,
  Download,
} from "lucide-react";

/*
 * Auth showcase: a tilted board of small product cards that shows what
 * DavaDesk does (bill scanning, billing, expiry, stock, udhar, GST reports).
 * Cards are drawn in HTML so they stay crisp at any size and in both themes.
 */

const card =
  "rounded-2xl bg-white text-zinc-900 shadow-[0_18px_40px_-12px_rgba(60,20,0,0.35)] ring-1 ring-black/5 " +
  "dark:bg-zinc-900 dark:text-zinc-100 dark:ring-white/10 dark:shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)] p-4";

function CardHead({ icon: Icon, label, tone = "orange" }) {
  const tones = {
    orange: "bg-orange-500/12 text-orange-600 dark:text-orange-400",
    emerald: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    rose: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
    sky: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
    violet: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  };
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${tones[tone]}`}>
        <Icon className="w-4 h-4" />
      </span>
      <span className="text-[13px] font-bold">{label}</span>
    </div>
  );
}

function ScanCard() {
  const rows = [
    ["Paracetamol 500 mg", "B2417", "08/27", "₹32.50"],
    ["Amoxicillin 250 mg", "AX903", "03/27", "₹84.00"],
    ["Cetirizine 10 mg", "CT118", "11/26", "₹18.70"],
  ];
  return (
    <div className={card}>
      <CardHead icon={ScanLine} label="Bill scanned" />
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Global Pharma Distributors</span>
        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">14 items read</span>
      </div>
      <div className="space-y-1.5">
        {rows.map(([name, batch, exp, mrp]) => (
          <div key={name} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center rounded-lg bg-zinc-50 dark:bg-white/5 px-2.5 py-1.5">
            <span className="text-[11px] font-semibold truncate">{name}</span>
            <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400">{batch} · {exp}</span>
            <span className="text-[11px] font-bold">{mrp}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SalesCard() {
  const bars = [38, 52, 44, 66, 58, 80, 72];
  return (
    <div className={card}>
      <CardHead icon={Receipt} label="Today's sales" tone="emerald" />
      <div className="text-2xl font-black tracking-tight">₹48,250</div>
      <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
        <TrendingUp className="w-3.5 h-3.5" /> 12.4% vs yesterday
      </div>
      <div className="flex items-end gap-1.5 h-14 mt-3">
        {bars.map((h, i) => (
          <div
            key={i}
            style={{ height: `${h}%` }}
            className={`flex-1 rounded-md ${i === bars.length - 2 ? "bg-orange-500" : "bg-orange-500/20"}`}
          />
        ))}
      </div>
    </div>
  );
}

function ExpiryCard() {
  const items = [
    ["Azithromycin 500", "12 days", "bg-rose-500"],
    ["Pantoprazole 40", "28 days", "bg-amber-500"],
    ["Vitamin D3 1000 IU", "45 days", "bg-amber-400"],
  ];
  return (
    <div className={card}>
      <CardHead icon={CalendarClock} label="Expiring soon" tone="rose" />
      <div className="space-y-2.5">
        {items.map(([name, left, dot]) => (
          <div key={name} className="flex items-center gap-2.5">
            <span className={`w-2 h-2 rounded-full ${dot}`} />
            <span className="text-[12px] font-semibold flex-1 truncate">{name}</span>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{left}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[11px] font-bold text-orange-600 dark:text-orange-400">Create return list →</div>
    </div>
  );
}

function StockCard() {
  const items = [
    ["Dolo 650", 82, "bg-emerald-500"],
    ["Pan-D", 34, "bg-amber-500"],
    ["Montair LC", 12, "bg-rose-500"],
  ];
  return (
    <div className={card}>
      <CardHead icon={Package} label="Stock on shelves" tone="sky" />
      <div className="space-y-2.5">
        {items.map(([name, pct, color]) => (
          <div key={name}>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="font-semibold">{name}</span>
              <span className="text-zinc-500 dark:text-zinc-400">{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-white/10">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PurchaseCard() {
  return (
    <div className={card}>
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
          <Check className="w-5 h-5 stroke-[3]" />
        </span>
        <div>
          <div className="text-[13px] font-bold">42 batches added</div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Inventory updated from 3 bills</div>
        </div>
      </div>
    </div>
  );
}

function KhataCard() {
  const people = [
    ["RS", "Ramesh Sharma", "₹2,340", "bg-orange-500"],
    ["PK", "Priya Kumari", "₹860", "bg-violet-500"],
  ];
  return (
    <div className={card}>
      <CardHead icon={Users} label="Customer udhar" tone="violet" />
      <div className="text-xl font-black tracking-tight mb-3">₹12,400 due</div>
      <div className="space-y-2">
        {people.map(([ini, name, amt, bg]) => (
          <div key={name} className="flex items-center gap-2.5">
            <span className={`w-6 h-6 rounded-full ${bg} text-white text-[9px] font-bold flex items-center justify-center`}>{ini}</span>
            <span className="text-[12px] font-semibold flex-1">{name}</span>
            <span className="text-[11px] font-bold">{amt}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
        <MessageCircle className="w-3.5 h-3.5" /> Send WhatsApp reminder
      </div>
    </div>
  );
}

function GstCard() {
  return (
    <div className={card}>
      <CardHead icon={FileBarChart} label="GST reports" />
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg bg-zinc-50 dark:bg-white/5 p-2">
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Profit</div>
          <div className="text-[13px] font-black">₹9,870</div>
        </div>
        <div className="rounded-lg bg-zinc-50 dark:bg-white/5 p-2">
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Margin</div>
          <div className="text-[13px] font-black">20.4%</div>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-white/10 px-2.5 py-1.5">
        <span className="text-[11px] font-semibold">GSTR-1 · October</span>
        <Download className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
      </div>
    </div>
  );
}

const COLUMNS = [
  { offset: "mt-24", cards: [SalesCard, PurchaseCard, StockCard] },
  { offset: "-mt-6", cards: [ScanCard, ExpiryCard, GstCard] },
  { offset: "mt-10", cards: [KhataCard, StockCard, SalesCard] },
];

export default function AuthLeftPanel({ steps = null, currentStep = 0 }) {
  return (
    <div className="w-full h-full min-h-screen p-3 select-none">
      <div className="relative w-full h-full min-h-[calc(100vh-1.5rem)] rounded-[28px] overflow-hidden bg-gradient-to-br from-orange-500 via-orange-600 to-[#c2410c] dark:from-[#1a0d05] dark:via-[#140a04] dark:to-black">
        {/* Soft light streaks for depth */}
        <div className="absolute -top-1/4 -left-1/4 w-[80%] h-[80%] rounded-full bg-amber-300/40 soft-glow dark:bg-orange-600/25 pointer-events-none" />
        <div className="absolute -bottom-1/4 -right-1/4 w-[70%] h-[70%] rounded-full bg-rose-600/40 soft-glow dark:bg-orange-500/10 pointer-events-none" />

        {/* Tilted board of feature cards */}
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
          <div
            className="absolute left-1/2 top-1/2 w-[920px] grid grid-cols-3 gap-5"
            style={{ transform: "translate(-42%, -54%) rotate(-14deg) skewX(4deg)" }}
          >
            {COLUMNS.map((col, ci) => (
              <div key={ci} className={`flex flex-col gap-5 ${col.offset}`}>
                {col.cards.map((C, i) => (
                  <C key={i} />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Fades so the logo and bottom copy stay readable */}
        <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-orange-600/80 to-transparent dark:from-black/80 pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-[#9a3412] via-[#9a3412]/80 to-transparent dark:from-black dark:via-black/85 pointer-events-none" />

        <div className="relative z-10 h-full min-h-[calc(100vh-1.5rem)] flex flex-col justify-between p-8 lg:p-10">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl bg-white flex items-center justify-center shadow-lg">
              <img
                src="/assets/svgs/logoBrand/logoOnlyWithoutBackground.svg"
                alt="DavaDesk"
                className="w-7 h-7 object-contain"
              />
            </span>
            <div className="flex flex-col">
              <span className="font-extrabold text-2xl tracking-tight text-white leading-tight">DavaDesk</span>
              <span className="text-[11px] font-semibold text-white/80">Smart Pharmacy Software</span>
            </div>
          </div>

          <div className="space-y-5 max-w-md">
            {steps && steps.length > 0 ? (
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-white/75 mb-1">
                  Step {currentStep + 1} of {steps.length}
                </div>
                {steps.map((s, i) => {
                  const isActive = i === currentStep;
                  const isCompleted = i < currentStep;
                  return (
                    <div
                      key={s}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 ${
                        isActive
                          ? "bg-white text-zinc-900 shadow-lg dark:bg-zinc-900 dark:text-white dark:ring-1 dark:ring-orange-500/60"
                          : "bg-white/10 text-white ring-1 ring-white/20"
                      }`}
                    >
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                          isCompleted
                            ? "bg-emerald-500 text-white"
                            : isActive
                            ? "bg-orange-500 text-white"
                            : "bg-white/15 text-white/80"
                        }`}
                      >
                        {isCompleted ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : i + 1}
                      </span>
                      <span className="text-[13px] font-bold">{s}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div>
                <h2 className="text-3xl lg:text-[34px] font-black text-white tracking-tight leading-tight">
                  Run your whole pharmacy from one desk.
                </h2>
                <p className="mt-3 text-sm lg:text-[15px] text-white/80 font-medium leading-relaxed">
                  Scan purchase bills, bill at the counter, and keep stock, expiry, udhar and GST in order.
                </p>
              </div>
            )}

            <div className="text-xs text-white/60 font-medium pt-4 border-t border-white/15">
              © {new Date().getFullYear()} DavaDesk. All rights reserved.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

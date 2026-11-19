import { FileText, ShieldAlert, Pill, Lock, Syringe, AlertOctagon } from "lucide-react";

// One look per drug schedule, everywhere: a solid tag and a thin left accent
// on list rows. Red stays reserved for problems (expired, unpaid, loss), so no
// schedule uses it. H1 keeps its violet.
export const SCHEDULE_STYLES = {
  H1: { label: "Schedule H1", short: "H1", tag: "bg-violet-600 text-white", row: "shadow-[inset_3px_0_0_0_rgb(124_58_237)]", icon: FileText, title: "Schedule H1: sold on prescription; keep the prescription with the bill" },
  H: { label: "Schedule H", short: "H", tag: "bg-sky-600 text-white", row: "shadow-[inset_3px_0_0_0_rgb(2_132_199)]", icon: Pill, title: "Schedule H: prescription-only medicine" },
  X: { label: "Schedule X", short: "X", tag: "bg-fuchsia-800 text-white", row: "shadow-[inset_3px_0_0_0_rgb(134_25_143)]", icon: Lock, title: "Schedule X: prescription in duplicate; keep a record for 2 years" },
  NDPS: { label: "NDPS", short: "NDPS", tag: "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900", row: "shadow-[inset_3px_0_0_0_rgb(15_23_42)]", icon: AlertOctagon, title: "NDPS: narcotic / psychotropic; controlled sale and register" },
  G: { label: "Schedule G", short: "G", tag: "bg-teal-600 text-white", row: "shadow-[inset_3px_0_0_0_rgb(13_148_136)]", icon: ShieldAlert, title: "Schedule G: use under medical supervision" },
  C: { label: "Schedule C", short: "C", tag: "bg-amber-500 text-amber-950", row: "shadow-[inset_3px_0_0_0_rgb(245_158_11)]", icon: Syringe, title: "Schedule C / C1: biological products; store as labelled" },
};

// Strictest first: when a bill has several, the row accent follows this
export const SCHEDULE_ORDER = ["NDPS", "X", "H1", "H", "G", "C"];

export const scheduleRowClass = (code) => SCHEDULE_STYLES[code]?.row || "";

// The strictest schedule of a set of codes
export const strictestSchedule = (codes = []) => SCHEDULE_ORDER.find((c) => codes.includes(c)) || null;

export default function ScheduleBadge({ schedule, short = false, label, title, testId, className = "" }) {
  const st = SCHEDULE_STYLES[schedule];
  if (!st) return null;
  const Icon = st.icon;
  return (
    <span
      data-testid={testId || `schedule-badge-${schedule.toLowerCase()}`}
      data-schedule={schedule}
      title={title || st.title}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-[3px] text-[10px] font-bold leading-none ${st.tag} ${className}`}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden="true" />
      {label || (short ? (schedule === "NDPS" ? "NDPS" : `S-${st.short}`) : st.label)}
    </span>
  );
}

// Every distinct schedule in a list of lines ({ product_name, schedule })
export function ScheduleBadges({ lines = [], short = true, className = "" }) {
  const codes = SCHEDULE_ORDER.filter((c) => lines.some((l) => l.schedule === c));
  if (!codes.length) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {codes.map((c) => (
        <ScheduleBadge
          key={c}
          schedule={c}
          short={short}
          title={`${SCHEDULE_STYLES[c].label}: ${lines.filter((l) => l.schedule === c).map((l) => l.product_name).join(", ")}`}
        />
      ))}
    </span>
  );
}

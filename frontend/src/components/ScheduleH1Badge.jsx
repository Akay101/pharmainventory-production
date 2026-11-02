import { FileText } from "lucide-react";

// One look for Schedule H1 everywhere: a solid violet tag, and a thin accent on
// list rows. Red stays reserved for problems (expired, unpaid, missing).
export const H1_ROW_CLASS = "shadow-[inset_3px_0_0_0_rgb(124_58_237)]";

export default function ScheduleH1Badge({
  label = "Schedule H1",
  title = "Schedule H1: sold only on prescription; the prescription is kept with the bill",
  testId = "h1-badge",
  className = "",
}) {
  return (
    <span
      data-testid={testId}
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-violet-600 px-1.5 py-[3px] text-[10px] font-bold leading-none text-white ${className}`}
    >
      <FileText className="h-2.5 w-2.5" aria-hidden="true" />
      {label}
    </span>
  );
}

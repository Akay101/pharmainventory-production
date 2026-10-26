// The date a bill / purchase is FOR, and when it was actually entered.
// A bill made today for yesterday shows "Billed 25 Oct" and "Created 26 Oct,
// 10:42 am" with a "Backdated" tag.
const istDay = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
};
const fmtDay = (ymd) =>
  /^\d{4}-\d{2}-\d{2}/.test(ymd || "")
    ? new Date(`${ymd.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    : "-";
const fmtStamp = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
};

export default function RecordDates({ date, createdAt, dateLabel = "Billed" }) {
  const day = (date || "").slice(0, 10) || (createdAt ? istDay(createdAt) : "");
  const createdDay = createdAt ? istDay(createdAt) : "";
  const backdated = day && createdDay && day !== createdDay;
  return (
    <div className="mt-0.5 space-y-0.5 text-[11px] font-medium text-muted-foreground" data-testid="record-dates">
      <div className="flex flex-wrap items-center gap-1.5">
        <span>
          {dateLabel} <span className="font-bold text-foreground">{fmtDay(day)}</span>
        </span>
        {backdated && (
          <span
            className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-px text-[9px] font-extrabold uppercase tracking-wide text-amber-600 dark:text-amber-400"
            title="Entered on a different day than its date"
          >
            {day < createdDay ? "Backdated" : "Future-dated"}
          </span>
        )}
      </div>
      {createdAt && <div>Created {fmtStamp(createdAt)}</div>}
    </div>
  );
}

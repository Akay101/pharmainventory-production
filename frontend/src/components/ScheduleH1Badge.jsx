import ScheduleBadge, { SCHEDULE_STYLES } from "./ScheduleBadge";

// Schedule H1's tag: the H1 style of ScheduleBadge (kept for its callers)
export const H1_ROW_CLASS = SCHEDULE_STYLES.H1.row;

export default function ScheduleH1Badge({
  label = "Schedule H1",
  title = SCHEDULE_STYLES.H1.title,
  testId = "h1-badge",
  className = "",
}) {
  return <ScheduleBadge schedule="H1" label={label} title={title} testId={testId} className={className} />;
}

import { useDashboardFormat } from "./use-dashboard-format";

// Relative date ("in 9 days") with the absolute date in a tooltip and as visually hidden text,
// so the exact date is available to everyone.
export function RelativeDate({
  date,
  today,
  timezone,
  at,
}: {
  date: string;
  today: string;
  timezone: string;
  at?: Date | null;
}) {
  const f = useDashboardFormat(timezone, today, true);
  const absolute = at ? f.when(at) : f.day(date);
  return (
    <time dateTime={at ? at.toISOString() : date} title={absolute} className="whitespace-nowrap">
      {f.relative(date)}
      <span className="sr-only">, {absolute}</span>
    </time>
  );
}

const UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: "year", ms: 31_536_000_000 },
  { unit: "month", ms: 2_592_000_000 },
  { unit: "week", ms: 604_800_000 },
  { unit: "day", ms: 86_400_000 },
  { unit: "hour", ms: 3_600_000 },
  { unit: "minute", ms: 60_000 },
];

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "always" });

// formatTimeAgo renders a timestamp relative to now, e.g. "5 minutes ago".
// Sub-minute differences collapse to "just now" so slow refresh ticks never
// show visibly stale second counts.
export function formatTimeAgo(thenMs: number, nowMs: number): string {
  const diff = thenMs - nowMs;
  for (const { unit, ms } of UNITS) {
    if (Math.abs(diff) >= ms) {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return "Just now";
}

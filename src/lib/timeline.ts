/**
 * Timeline helpers. All day bucketing uses one explicit time zone so the
 * server render and every client agree (no hydration mismatches, no
 * "event moved a day" surprises for viewers in other zones).
 */
export const ATLAS_TIME_ZONE = "Asia/Taipei";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ATLAS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const displayDate = new Intl.DateTimeFormat("zh-TW", {
  timeZone: ATLAS_TIME_ZONE,
  year: "numeric",
  month: "long",
  day: "numeric",
});

const displayDateTime = new Intl.DateTimeFormat("zh-TW", {
  timeZone: ATLAS_TIME_ZONE,
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD in the atlas time zone. Throws on invalid input (schema rejects those earlier). */
export function dayKey(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) throw new Error(`Invalid date "${iso}"`);
  return dayFormatter.format(time);
}

export function isDayKey(value: string): boolean {
  if (!DAY_KEY.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
}

export function formatDay(key: string): string {
  // Noon UTC keeps the calendar day stable in any zone within ±11h.
  return displayDate.format(Date.parse(`${key}T12:00:00Z`));
}

export function formatDate(iso: string): string {
  return displayDate.format(Date.parse(iso));
}

export function formatDateTime(iso: string): string {
  return displayDateTime.format(Date.parse(iso));
}

/** Index of the cutoff within `days`; null cutoff (= everything) maps to the last index. */
export function cutoffIndex(days: readonly string[], until: string | null): number {
  if (days.length === 0) return 0;
  if (until === null) return days.length - 1;
  let index = -1;
  for (let i = 0; i < days.length; i++) if ((days[i] ?? "") <= until) index = i;
  return Math.max(0, index);
}

/** Normalised cutoff for a slider index; the last index means "no cutoff". */
export function cutoffForIndex(days: readonly string[], index: number): string | null {
  if (days.length === 0 || index >= days.length - 1) return null;
  return days[Math.max(0, Math.floor(index))] ?? null;
}

/**
 * Next cutoff when playing. Starting from "everything" restarts at the first
 * day; reaching the last day returns null and the caller stops playback.
 */
export function nextPlaybackCutoff(days: readonly string[], until: string | null): { until: string | null; done: boolean } {
  if (days.length === 0) return { until: null, done: true };
  if (until === null) return { until: days[0] ?? null, done: days.length === 1 };
  const next = cutoffIndex(days, until) + 1;
  if (next >= days.length - 1) return { until: null, done: true };
  return { until: days[next] ?? null, done: false };
}

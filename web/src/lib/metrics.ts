// Client-side derived metrics: goal lookup, rolling averages, step streak, formatting.
import type { DailyStep, Goal, WeightLog } from "./types.ts";

export function goalValue(goals: Goal[], metric: string, fallback: number): number {
  const g = goals.find((x) => x.metric === metric);
  return g ? Number(g.target_value) : fallback;
}

export function goalDirection(goals: Goal[], metric: string): "down" | "up" {
  const g = goals.find((x) => x.metric === metric);
  return g?.direction === "up" ? "up" : "down";
}

const DAY_MS = 86400000;

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Build a 7-day trailing average line for weight measurements, keyed per measurement point.
// Returns points sorted ascending with { date, weight, avg }.
export function weightSeriesWithTrailingAvg(
  logs: WeightLog[],
): Array<{ t: number; date: string; weight: number; avg: number }> {
  const sorted = [...logs].sort(
    (a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime(),
  );
  return sorted.map((log) => {
    const t = new Date(log.measured_at).getTime();
    const windowStart = t - 6 * DAY_MS;
    const inWindow = sorted.filter((x) => {
      const xt = new Date(x.measured_at).getTime();
      return xt >= windowStart && xt <= t;
    });
    const avg = inWindow.reduce((s, x) => s + x.weight_kg, 0) / inWindow.length;
    return { t, date: log.measured_at, weight: log.weight_kg, avg: round1(avg) };
  });
}

// Latest weight and the change vs ~7 days ago (using trailing average for stability).
export function weightSummary(
  logs: WeightLog[],
): { latest: number | null; weeklyDelta: number | null } {
  const series = weightSeriesWithTrailingAvg(logs);
  if (series.length === 0) return { latest: null, weeklyDelta: null };
  const last = series[series.length - 1];
  const weekAgoT = last.t - 7 * DAY_MS;
  // Closest point to one week before the latest.
  let ref = series[0];
  for (const p of series) {
    if (Math.abs(p.t - weekAgoT) < Math.abs(ref.t - weekAgoT)) ref = p;
  }
  const delta = last.avg - ref.avg;
  return { latest: round1(last.weight), weeklyDelta: series.length > 1 ? round1(delta) : null };
}

// Current streak: consecutive days (ending today or yesterday) with steps >= goal.
export function stepStreak(steps: DailyStep[], goal: number): number {
  const byDate = new Map(steps.map((s) => [s.date, s.steps]));
  let streak = 0;
  // Allow the streak to be "alive" if today has no data yet but yesterday met the goal.
  let cursor = new Date();
  if (!byDate.has(dateKey(cursor))) cursor = new Date(cursor.getTime() - DAY_MS);
  for (let i = 0; i < 400; i++) {
    const key = dateKey(cursor);
    const v = byDate.get(key);
    if (v !== undefined && v >= goal) {
      streak++;
      cursor = new Date(cursor.getTime() - DAY_MS);
    } else {
      break;
    }
  }
  return streak;
}

// Sum of active hours (all sports) for the current ISO-ish week (Mon–Sun) from moving seconds.
export function sumHours(movingSecondsList: number[]): number {
  return round1(movingSecondsList.reduce((a, b) => a + b, 0) / 3600);
}

export function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = (copy.getDay() + 6) % 7; // Monday = 0
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - day);
  return copy;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatPace(minPerKm: number | null): string {
  if (minPerKm == null || !isFinite(minPerKm)) return "—";
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Week/Month period bucketing + period-over-period (WoW / MoM) comparisons
// ---------------------------------------------------------------------------
export type Period = "day" | "week" | "month";

export function periodNoun(period: Period): string {
  return period === "day" ? "day" : period === "week" ? "week" : "month";
}

export function periodAdjective(period: Period): string {
  return period === "day" ? "daily" : period === "week" ? "weekly" : "monthly";
}

// Label for the previous period, used in delta captions.
export function previousLabel(period: Period): string {
  return period === "day" ? "yesterday" : period === "week" ? "last week" : "last month";
}

// How many buckets each view shows (Day zooms in on the last month of daily detail).
export function bucketCount(period: Period): number {
  return period === "day" ? 30 : 12;
}

// Local YYYY-MM-DD (avoids UTC off-by-one from toISOString).
function localKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Start of the bucket (Monday for week, 1st for month) containing `d`.
export function bucketStart(d: Date, period: Period): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  if (period === "week") {
    const day = (c.getDay() + 6) % 7; // Monday = 0
    c.setDate(c.getDate() - day);
  } else if (period === "month") {
    c.setDate(1);
  }
  // day: already at local midnight
  return c;
}

export function addPeriods(d: Date, period: Period, n: number): Date {
  const c = new Date(d);
  if (period === "day") c.setDate(c.getDate() + n);
  else if (period === "week") c.setDate(c.getDate() + n * 7);
  else c.setMonth(c.getMonth() + n);
  return c;
}

export function bucketLabel(key: string, period: Period): string {
  const d = new Date(key + "T00:00:00");
  return period === "month"
    ? d.toLocaleDateString(undefined, { month: "short", year: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export interface Bucket {
  key: string;
  label: string;
  start: number; // epoch ms, inclusive
  end: number; // epoch ms, exclusive
}

// The last `count` calendar buckets, chronological, including empty ones.
export function recentBuckets(period: Period, count: number, now = new Date()): Bucket[] {
  const cur = bucketStart(now, period);
  const out: Bucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const s = addPeriods(cur, period, -i);
    const e = addPeriods(s, period, 1);
    out.push({ key: localKey(s), label: bucketLabel(localKey(s), period), start: s.getTime(), end: e.getTime() });
  }
  return out;
}

// Assign each item to a bucket index by its timestamp; items outside all buckets are dropped.
export function bucketIndexOf(buckets: Bucket[], t: number): number {
  return buckets.findIndex((b) => t >= b.start && t < b.end);
}

// Trailing window [start,end) for deltas: offset 0 = current window, -1 = previous.
// Uses a rolling window (last 7 / last 30 days) so a partial calendar period doesn't skew the Δ.
export function trailingBounds(period: Period, offset: number, now = new Date()): { start: number; end: number } {
  const days = period === "day" ? 1 : period === "week" ? 7 : 30;
  const anchor = new Date(now);
  anchor.setHours(0, 0, 0, 0);
  const end = anchor.getTime() + DAY_MS + offset * days * DAY_MS; // include today
  return { start: end - days * DAY_MS, end };
}

export function pctDelta(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

export function average(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

// ---------------------------------------------------------------------------
// Weight units. Data is stored canonically in kg (Withings); the UI converts for display.
// Flip WEIGHT_UNIT to "kg" to switch the whole dashboard back.
// ---------------------------------------------------------------------------
export const WEIGHT_UNIT: "kg" | "lb" = "lb";
const KG_TO_LB = 2.2046226218;

// Convert a kg value (or a kg delta — the scale is linear) to the display unit.
export function toDisplayWeight(kg: number): number {
  return WEIGHT_UNIT === "lb" ? kg * KG_TO_LB : kg;
}

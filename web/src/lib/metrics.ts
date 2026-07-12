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

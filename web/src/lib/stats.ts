// Derived running stats for the Home / Stats screens. Pure functions over data already loaded in
// the browser, so none of this needs a backend change.
import type { Activity, Goal, WeightLog } from "./types.ts";
import { goalValue, localDateKey, weightSeriesWithTrailingAvg } from "./metrics.ts";

const DAY_MS = 86400000;

export const runsOf = (acts: Activity[]): Activity[] => acts.filter((a) => a.type_group === "Run");

// Local Monday 00:00 of the week containing d.
export function mondayOf(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() - ((c.getDay() + 6) % 7));
  return c;
}

export function runTotals(acts: Activity[]): { count: number; km: number; seconds: number } {
  const runs = runsOf(acts);
  return {
    count: runs.length,
    km: runs.reduce((s, a) => s + a.distance_m / 1000, 0),
    seconds: runs.reduce((s, a) => s + a.moving_time_s, 0),
  };
}

export function runsThisMonth(acts: Activity[], now = new Date()): number {
  return runsOf(acts).filter((a) => {
    const d = new Date(a.started_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
}

// "About 2.1x London to Paris" — a landmark to make a big number feel real, like openGym's blue whale.
const LANDMARKS: { name: string; km: number }[] = [
  { name: "a marathon", km: 42.2 },
  { name: "London to Brighton", km: 85 },
  { name: "London to Paris", km: 340 },
  { name: "London to Edinburgh", km: 650 },
  { name: "London to Rome", km: 1860 },
  { name: "London to Istanbul", km: 3000 },
];
export function distanceComparison(km: number): string | null {
  const fit = [...LANDMARKS].reverse().find((l) => km >= l.km);
  if (!fit) return null;
  const ratio = km / fit.km;
  return ratio < 1.15 ? `About ${fit.name}.` : `About ${ratio.toFixed(1)}× ${fit.name}.`;
}

// --- Streak with freezes -------------------------------------------------------------------
export const MIN_RUNS_PER_WEEK = 1;
export const FREEZE_EVERY = 4; // a freeze is earned every N qualifying weeks in a row
export const MAX_FREEZES = 2;
export const BADGES = [4, 12, 26, 52, 104];

export interface StreakInfo {
  current: number;
  best: number;
  freezes: number;
  thisWeekRuns: number;
  thisWeekDone: boolean;
  nextBadge: number | null;
  earned: number[];
}

// A week (Mon-Sun) counts when it has at least MIN_RUNS_PER_WEEK runs. A missed week spends a
// freeze if you have one and the streak carries on; with none, it resets. The week in progress
// never breaks the streak - it only adds to it once you've hit the target.
export function streakInfo(acts: Activity[], now = new Date()): StreakInfo {
  const runs = runsOf(acts);
  const perWeek = new Map<string, number>();
  for (const a of runs) {
    const k = localDateKey(mondayOf(new Date(a.started_at)));
    perWeek.set(k, (perWeek.get(k) ?? 0) + 1);
  }

  const thisMonday = mondayOf(now);
  const thisKey = localDateKey(thisMonday);
  const thisWeekRuns = perWeek.get(thisKey) ?? 0;
  const thisWeekDone = thisWeekRuns >= MIN_RUNS_PER_WEEK;

  let streak = 0;
  let best = 0;
  let freezes = 0;
  let sinceFreeze = 0;

  if (runs.length > 0) {
    const first = mondayOf(new Date(Math.min(...runs.map((a) => new Date(a.started_at).getTime()))));
    // Step by calendar weeks (not a fixed 7*24h) so the clock change doesn't skip or repeat a Monday.
    for (let w = new Date(first); w < thisMonday; w = new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7)) {
      const k = localDateKey(w);
      if ((perWeek.get(k) ?? 0) >= MIN_RUNS_PER_WEEK) {
        streak++;
        sinceFreeze++;
        if (sinceFreeze >= FREEZE_EVERY) {
          freezes = Math.min(MAX_FREEZES, freezes + 1);
          sinceFreeze = 0;
        }
      } else if (streak > 0 && freezes > 0) {
        freezes--; // missed week absorbed, no harm done
      } else {
        streak = 0;
        sinceFreeze = 0;
      }
      best = Math.max(best, streak);
    }
  }

  const current = streak + (thisWeekDone ? 1 : 0);
  best = Math.max(best, current);
  return {
    current,
    best,
    freezes,
    thisWeekRuns,
    thisWeekDone,
    nextBadge: BADGES.find((b) => b > current) ?? null,
    earned: BADGES.filter((b) => b <= best),
  };
}

// --- Activity heatmap ----------------------------------------------------------------------
export type HeatMetric = "time" | "distance";
export interface HeatCell {
  date: string;
  value: number;
  future: boolean;
}

// 53 week-columns x 7 weekday rows (Mon first), ending with the current week.
export function heatmap(acts: Activity[], metric: HeatMetric, now = new Date()) {
  const byDay = new Map<string, number>();
  for (const a of runsOf(acts)) {
    const k = localDateKey(new Date(a.started_at));
    byDay.set(k, (byDay.get(k) ?? 0) + (metric === "time" ? a.moving_time_s / 60 : a.distance_m / 1000));
  }
  const thisMonday = mondayOf(now);
  const today = localDateKey(now);
  const weeks: HeatCell[][] = [];
  for (let w = 52; w >= 0; w--) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(thisMonday);
      day.setDate(thisMonday.getDate() - w * 7 + d);
      const date = localDateKey(day);
      col.push({ date, value: byDay.get(date) ?? 0, future: date > today });
    }
    weeks.push(col);
  }
  const max = Math.max(0, ...weeks.flat().map((c) => c.value));
  return { weeks, max };
}

// 0 = empty, 1-4 = quartiles of the busiest day.
export function heatLevel(value: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0 || max <= 0) return 0;
  const r = value / max;
  return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1;
}

// --- Weight --------------------------------------------------------------------------------
export interface WeightStats {
  latestKg: number | null;
  latestAt: string | null;
  deltaKg: number | null; // vs the previous weigh-in
  change30Kg: number | null; // vs ~30 days ago
  trendKgPerWeek: number | null; // least-squares slope over the last 28 days
  trendPct: number | null;
  goalKg: number | null;
  toGoalKg: number | null;
}

export function weightStats(weights: WeightLog[], goals: Goal[]): WeightStats {
  const s = weightSeriesWithTrailingAvg(weights);
  const empty: WeightStats = {
    latestKg: null, latestAt: null, deltaKg: null, change30Kg: null,
    trendKgPerWeek: null, trendPct: null, goalKg: null, toGoalKg: null,
  };
  if (s.length === 0) return empty;

  const last = s[s.length - 1];
  const prev = s.length > 1 ? s[s.length - 2] : null;

  const target30 = last.t - 30 * DAY_MS;
  let ref: (typeof s)[number] | null = null;
  for (const p of s) if (p !== last && (!ref || Math.abs(p.t - target30) < Math.abs(ref.t - target30))) ref = p;
  // Only meaningful if the reference is actually near 30 days back.
  // A "30 day" change only means something if the latest weigh-in is itself recent; with no weigh-in
  // for weeks, show nothing rather than an old comparison dressed up as current.
  const fresh = Date.now() - last.t <= 14 * DAY_MS;
  const change30 = fresh && ref && Math.abs(ref.t - target30) <= 14 * DAY_MS ? last.weight - ref.weight : null;

  const recent = s.filter((p) => p.t >= last.t - 28 * DAY_MS);
  let trend: number | null = null;
  if (recent.length >= 3) {
    const xs = recent.map((p) => (p.t - recent[0].t) / DAY_MS);
    const ys = recent.map((p) => p.weight);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    if (den > 0) trend = (xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den) * 7;
  }

  const goal = goalValue(goals, "target_weight", NaN);
  const goalKg = Number.isFinite(goal) ? goal : null;
  return {
    latestKg: last.weight,
    latestAt: last.date,
    deltaKg: prev ? last.weight - prev.weight : null,
    change30Kg: change30,
    trendKgPerWeek: trend,
    trendPct: trend != null ? (trend / last.weight) * 100 : null,
    goalKg,
    toGoalKg: goalKg != null ? last.weight - goalKg : null,
  };
}

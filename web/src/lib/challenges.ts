// Monthly challenges, scaled from your own last three months so they are a stretch, not a fantasy.
// Computed in the browser from activities; nothing is stored, so a challenge is "done" the moment
// the numbers say so.
import type { Activity, Goal } from "./types.ts";
import { goalValue } from "./metrics.ts";
import { runsOf } from "./stats.ts";

export interface Challenge {
  id: string;
  title: string;
  progress: number;
  target: number;
  unit: string; // "" | "km"
  done: boolean;
}

export interface MonthChallenges {
  label: string; // "November 2026"
  items: Challenge[];
  doneCount: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const inMonth = (iso: string, y: number, m: number) => {
  const d = new Date(iso);
  return d.getFullYear() === y && d.getMonth() === m;
};

export function monthChallenges(activities: Activity[], goals: Goal[], now = new Date()): MonthChallenges {
  const runs = runsOf(activities);
  const y = now.getFullYear();
  const m = now.getMonth();

  // The three full months before this one.
  const prior = [1, 2, 3].map((back) => {
    const d = new Date(y, m - back, 1);
    const inThat = runs.filter((r) => inMonth(r.started_at, d.getFullYear(), d.getMonth()));
    return { count: inThat.length, km: inThat.reduce((s, r) => s + r.distance_m / 1000, 0) };
  });
  // Beat your best of the last three full months. Using the best (not the average) makes it a real
  // stretch, and it stays fixed all month because this month isn't part of the baseline.
  const bestRuns = Math.max(0, ...prior.map((p) => p.count));
  const bestKm = Math.max(0, ...prior.map((p) => p.km));

  // Longest run in the 90 days BEFORE this month starts. Counting this month's own runs would make
  // the long-run target equal to the thing you've just done.
  const monthStart = new Date(y, m, 1).getTime();
  const longest = Math.max(
    0,
    ...runs
      .filter((r) => {
        const t = new Date(r.started_at).getTime();
        return t < monthStart && t >= monthStart - 90 * 86400000;
      })
      .map((r) => r.distance_m / 1000),
  );

  const weeklyGoal = goalValue(goals, "weekly_running_km_goal", NaN);
  const monthlyGoalKm = Number.isFinite(weeklyGoal) ? weeklyGoal * 4 : 200;

  const targetRuns = clamp(bestRuns + 1, 4, 16);
  const targetKm = clamp(Math.ceil((bestKm * 1.2) / 5) * 5, 20, monthlyGoalKm);
  const targetLong = clamp(Math.round(longest) + 1, 6, 21);

  const thisMonth = runs.filter((r) => inMonth(r.started_at, y, m));
  const runsDone = thisMonth.length;
  const kmDone = thisMonth.reduce((s, r) => s + r.distance_m / 1000, 0);
  const longDone = Math.max(0, ...thisMonth.map((r) => r.distance_m / 1000));

  const items: Challenge[] = [
    { id: "runs", title: `Run ${targetRuns} times this month`, progress: runsDone, target: targetRuns, unit: "", done: runsDone >= targetRuns },
    { id: "km", title: `Run ${targetKm} km this month`, progress: Math.round(kmDone * 10) / 10, target: targetKm, unit: "km", done: kmDone >= targetKm },
    { id: "long", title: `One run of ${targetLong} km or more`, progress: Math.round(longDone * 10) / 10, target: targetLong, unit: "km", done: longDone >= targetLong },
  ];

  return {
    label: now.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    items,
    doneCount: items.filter((i) => i.done).length,
  };
}

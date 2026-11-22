// Rule-based Home insights: a few checks over data already loaded in the browser, ranked by priority.
// No AI call and no backend, so they are free and instant. Each insight has an id that changes when
// the underlying situation changes, so dismissing one stays dismissed until something new happens.
import type { Activity, Goal, RunPlan } from "./types.ts";
import { goalValue, localDateKey } from "./metrics.ts";
import { MIN_RUNS_PER_WEEK, mondayOf, runsOf, streakInfo } from "./stats.ts";
import type { Tab } from "../components/TabBar.tsx";

export interface Insight {
  id: string;
  tag: string; // small label above the title, e.g. "Streak"
  title: string;
  body?: string;
  tone: "good" | "warn" | "info";
  action?: { label: string; tab: Tab };
}

const DAY_MS = 86400000;

// Highest priority first; the Home card shows the first one that hasn't been dismissed.
export function buildInsights(
  activities: Activity[],
  plans: RunPlan[],
  goals: Goal[],
  now = new Date(),
): Insight[] {
  const out: Insight[] = [];
  const runs = [...runsOf(activities)].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  const weekKey = localDateKey(mondayOf(now));
  const dow = (now.getDay() + 6) % 7; // Mon = 0
  const streak = streakInfo(activities, now);

  // 1. Streak at risk: late in the week, no run yet, and a streak worth protecting.
  if (dow >= 4 && streak.thisWeekRuns < MIN_RUNS_PER_WEEK && streak.current >= 2) {
    const freeze = streak.freezes > 0 ? ` You have ${streak.freezes} freeze${streak.freezes > 1 ? "s" : ""} if you miss it.` : "";
    out.push({
      id: `streak-${weekKey}`,
      tag: "Streak",
      title: `Run this week to keep your ${streak.current}-week streak`,
      body: `Nothing logged yet this week.${freeze}`,
      tone: "warn",
      action: { label: "See today's run", tab: "coach" },
    });
  }

  // 2. A new longest run in the last week.
  if (runs.length >= 3) {
    const recent = runs.filter((r) => now.getTime() - new Date(r.started_at).getTime() <= 7 * DAY_MS);
    const older = runs.filter((r) => now.getTime() - new Date(r.started_at).getTime() > 7 * DAY_MS);
    const bestRecent = recent.sort((a, b) => b.distance_m - a.distance_m)[0];
    const bestOlder = Math.max(0, ...older.map((r) => r.distance_m));
    if (bestRecent && older.length > 0 && bestRecent.distance_m > bestOlder) {
      out.push({
        id: `longest-${bestRecent.strava_id}`,
        tag: "Record",
        title: `New longest run: ${(bestRecent.distance_m / 1000).toFixed(1)} km`,
        body: `Your previous best was ${(bestOlder / 1000).toFixed(1)} km.`,
        tone: "good",
      });
    }
  }

  // 3. Easy days keep coming in too hard, per the coach's graded reviews.
  const graded = plans.filter((p) => p.adherence).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const hard = graded.filter((p) => p.adherence === "harder");
  if (graded.length >= 3 && hard.length >= 2) {
    out.push({
      id: `hard-${graded[0].date}`,
      tag: "Pacing",
      title: "Your easy runs keep coming in too hot",
      body: `${hard.length} of your last ${graded.length} graded runs went harder than asked. Let heart rate set the pace, not the other way round.`,
      tone: "warn",
      action: { label: "Open the coach", tab: "coach" },
    });
  }

  // 4. A long gap since the last run.
  const last = runs[0];
  if (last) {
    const gap = Math.floor((now.getTime() - new Date(last.started_at).getTime()) / DAY_MS);
    if (gap >= 5) {
      out.push({
        id: `gap-${last.strava_id}`,
        tag: "Recovery",
        title: `${gap} days since your last run`,
        body: "A short, easy run is plenty to get going again.",
        tone: "info",
        action: { label: "Get today's run", tab: "coach" },
      });
    }
  }

  // 5. Close to the weekly goal: encouragement only when it's within reach (the goal is a target).
  const goalKm = goalValue(goals, "weekly_running_km_goal", NaN);
  if (Number.isFinite(goalKm) && goalKm > 0) {
    const mon = mondayOf(now).getTime();
    const weekKm = runs.filter((r) => new Date(r.started_at).getTime() >= mon).reduce((s, r) => s + r.distance_m / 1000, 0);
    if (weekKm >= goalKm * 0.7 && weekKm < goalKm) {
      out.push({
        id: `close-${weekKey}`,
        tag: "Weekly goal",
        title: `${(goalKm - weekKm).toFixed(1)} km to your weekly goal`,
        body: `${weekKm.toFixed(1)} of ${goalKm} km done.`,
        tone: "good",
      });
    }
  }

  return out;
}

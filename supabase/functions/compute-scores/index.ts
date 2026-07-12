// Compute + store the daily Health 360 score. Invoked nightly by pg_cron (after reconcile) or
// manually. Recomputes the last few days so late-arriving data (missed webhook backfilled by
// reconcile) is reflected. All dates are handled in UTC.

import { getServiceClient, type SupabaseClient } from "../_shared/supabase.ts";
import {
  computeDailyScore,
  mean,
  type Direction,
  type ScoreGoals,
} from "../_shared/scoring.ts";
import { json } from "../_shared/cors.ts";

const RECOMPUTE_DAYS = 3; // today + the previous 2 days

// YYYY-MM-DD for a Date, in UTC.
function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

// Start-of-day (00:00:00.000 UTC) for the given date.
function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function loadGoals(client: SupabaseClient): Promise<ScoreGoals> {
  const { data, error } = await client
    .from("goals")
    .select("metric, target_value, direction");
  if (error) throw new Error(`Failed to load goals: ${error.message}`);

  const map = new Map<string, { value: number; direction: string | null }>();
  for (const g of data ?? []) map.set(g.metric, { value: Number(g.target_value), direction: g.direction });

  const val = (m: string, fallback: number) => map.get(m)?.value ?? fallback;

  return {
    dailyStepGoal: val("daily_step_goal", 10000),
    weeklyActiveHoursGoal: val("weekly_active_hours_goal", 5),
    weightDirection: (map.get("target_weight")?.direction as Direction) ?? "down",
    cap: val("score_cap_ratio", 1.2),
    weights: {
      movement: val("pillar_weight_movement", 0.4),
      exercise: val("pillar_weight_exercise", 0.4),
      weight: val("pillar_weight_weight", 0.2),
    },
  };
}

// Steps recorded for a given day (null if there's no row).
async function stepsForDay(client: SupabaseClient, day: string): Promise<number | null> {
  const { data, error } = await client
    .from("daily_steps")
    .select("steps")
    .eq("date", day)
    .maybeSingle();
  if (error) throw new Error(`steps query failed: ${error.message}`);
  return data ? Number(data.steps) : null;
}

// Trailing-7-day active hours ending on `dayMid` (inclusive). `dayMid` is UTC midnight.
async function activeHours(client: SupabaseClient, dayMid: Date): Promise<number> {
  const startIso = addDays(dayMid, -6).toISOString(); // 7-day window inclusive of the day
  const endIso = addDays(dayMid, 1).toISOString(); // exclusive upper bound (start of next day)
  const { data, error } = await client
    .from("activities")
    .select("moving_time_s")
    .gte("started_at", startIso)
    .lt("started_at", endIso);
  if (error) throw new Error(`activities query failed: ${error.message}`);
  const seconds = (data ?? []).reduce((acc, a) => acc + Number(a.moving_time_s ?? 0), 0);
  return seconds / 3600;
}

// 7-day rolling averages of weight: the window ending on `dayMid` ([day-6, day]) and the window
// ending 7 days earlier ([day-13, day-7]). `dayMid` is UTC midnight.
async function weightAverages(
  client: SupabaseClient,
  dayMid: Date,
): Promise<{ recent: number | null; prior: number | null }> {
  const priorStart = addDays(dayMid, -13); // covers both 7-day windows
  const recentStart = addDays(dayMid, -6);
  const endIso = addDays(dayMid, 1).toISOString();
  const { data, error } = await client
    .from("weight_logs")
    .select("measured_at, weight_kg")
    .gte("measured_at", priorStart.toISOString())
    .lt("measured_at", endIso);
  if (error) throw new Error(`weight query failed: ${error.message}`);

  const recentStartT = recentStart.getTime();
  const priorStartT = priorStart.getTime();

  const recent: number[] = [];
  const prior: number[] = [];
  for (const row of data ?? []) {
    const t = new Date(row.measured_at).getTime();
    const w = Number(row.weight_kg);
    if (t >= recentStartT) recent.push(w); // [day-6, day]
    else if (t >= priorStartT) prior.push(w); // [day-13, day-7)
  }
  return { recent: mean(recent), prior: mean(prior) };
}

async function computeForDay(client: SupabaseClient, day: Date, goals: ScoreGoals) {
  const dayMid = utcMidnight(day);
  const key = dateKey(dayMid);
  const [steps, hours, weights] = await Promise.all([
    stepsForDay(client, key),
    activeHours(client, dayMid),
    weightAverages(client, dayMid),
  ]);

  const result = computeDailyScore(
    {
      steps,
      weeklyActiveHours: hours,
      weightRecentAvg: weights.recent,
      weightPriorAvg: weights.prior,
    },
    goals,
  );

  const { error } = await client.from("daily_scores").upsert(
    {
      date: key,
      total: result.total,
      movement_score: result.movement,
      exercise_score: result.exercise,
      weight_score: result.weight,
      details: { ...result.details, effectiveWeights: result.effectiveWeights },
      computed_at: new Date().toISOString(),
    },
    { onConflict: "date" },
  );
  if (error) throw new Error(`Failed to upsert daily_scores for ${key}: ${error.message}`);

  return { date: key, total: result.total };
}

Deno.serve(async (_req) => {
  try {
    const client = getServiceClient();
    const goals = await loadGoals(client);

    const today = new Date();
    const results = [];
    for (let i = 0; i < RECOMPUTE_DAYS; i++) {
      results.push(await computeForDay(client, addDays(today, -i), goals));
    }
    return json({ ok: true, computed: results }, 200);
  } catch (e) {
    console.error("compute-scores error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

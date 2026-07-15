// Compute + store the daily Health 360 score. Invoked nightly by pg_cron (after reconcile) or
// manually. By default it recomputes the last few days (so late-arriving data is reflected);
// pass ?days=N (or {"days":N}) to backfill a longer range — e.g. ?days=365 for a full year.
//
// All data is fetched once and scored in-memory, so a year-long backfill is a handful of queries
// plus a single bulk upsert. All dates are handled in UTC.

import { getServiceClient, type SupabaseClient } from "../_shared/supabase.ts";
import { computeDailyScore, mean, type Direction, type ScoreGoals } from "../_shared/scoring.ts";
import { json, handlePreflight } from "../_shared/cors.ts";

const DEFAULT_DAYS = 3;
const MAX_DAYS = 400;
const DAY = 86400000;

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}
function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function loadGoals(client: SupabaseClient): Promise<ScoreGoals> {
  const { data, error } = await client.from("goals").select("metric, target_value, direction");
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

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const client = getServiceClient();

    // How many days back to (re)compute.
    let days = DEFAULT_DAYS;
    const qDays = new URL(req.url).searchParams.get("days");
    if (qDays) days = Number(qDays);
    else {
      try {
        const body = await req.json();
        if (body?.days) days = Number(body.days);
      } catch (_) { /* no/invalid body → default */ }
    }
    if (!Number.isFinite(days) || days <= 0) days = DEFAULT_DAYS;
    days = Math.min(days, MAX_DAYS);

    const goals = await loadGoals(client);

    const today = utcMidnight(new Date());
    const oldest = addDays(today, -(days - 1));
    const fetchFrom = addDays(oldest, -14); // extra history for the weight prior window

    // Fetch everything once.
    const [stepsRes, actRes, wRes] = await Promise.all([
      client.from("daily_steps").select("date, steps").gte("date", dateKey(fetchFrom)),
      client.from("activities").select("started_at, moving_time_s").gte("started_at", fetchFrom.toISOString()),
      client.from("weight_logs").select("measured_at, weight_kg").gte("measured_at", fetchFrom.toISOString()),
    ]);
    if (stepsRes.error) throw new Error(stepsRes.error.message);
    if (actRes.error) throw new Error(actRes.error.message);
    if (wRes.error) throw new Error(wRes.error.message);

    const stepsByDate = new Map<string, number>();
    for (const s of stepsRes.data ?? []) stepsByDate.set(s.date, Number(s.steps));
    const acts = (actRes.data ?? []).map((a) => ({ t: new Date(a.started_at).getTime(), s: Number(a.moving_time_s ?? 0) }));
    const wts = (wRes.data ?? []).map((w) => ({ t: new Date(w.measured_at).getTime(), kg: Number(w.weight_kg) }));

    const computedAt = new Date().toISOString();
    const rows = [];
    for (let i = 0; i < days; i++) {
      const day = addDays(today, -i);
      const key = dateKey(day);
      const ms = day.getTime();

      const steps = stepsByDate.has(key) ? stepsByDate.get(key)! : null;

      // Trailing-7-day active hours ending on `day` (inclusive).
      const exStart = ms - 6 * DAY;
      const exEnd = ms + DAY;
      const weeklyActiveHours = acts.filter((a) => a.t >= exStart && a.t < exEnd).reduce((sum, a) => sum + a.s, 0) / 3600;

      // 7-day rolling weight averages: recent [day-6, day], prior [day-13, day-7].
      const recentStart = ms - 6 * DAY;
      const priorStart = ms - 13 * DAY;
      const recent = wts.filter((w) => w.t >= recentStart && w.t < exEnd).map((w) => w.kg);
      const prior = wts.filter((w) => w.t >= priorStart && w.t < recentStart).map((w) => w.kg);

      const result = computeDailyScore(
        { steps, weeklyActiveHours, weightRecentAvg: mean(recent), weightPriorAvg: mean(prior) },
        goals,
      );

      rows.push({
        date: key,
        total: result.total,
        movement_score: result.movement,
        exercise_score: result.exercise,
        weight_score: result.weight,
        details: { ...result.details, effectiveWeights: result.effectiveWeights },
        computed_at: computedAt,
      });
    }

    const { error } = await client.from("daily_scores").upsert(rows, { onConflict: "date" });
    if (error) throw new Error(`Failed to upsert daily_scores: ${error.message}`);

    return json({ ok: true, computed_days: rows.length, from: dateKey(oldest), to: dateKey(today) }, 200);
  } catch (e) {
    console.error("compute-scores error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

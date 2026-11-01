// AI running coach: summarizes the last 14 days of training and asks Claude for today's run.
//
// Invoked from the dashboard with the anon key (verify_jwt). Reads activities via the service
// role and calls the Anthropic API with a server-side key (ANTHROPIC_API_KEY) — the key never
// reaches the browser. An optional RACE_GOAL secret (free text, e.g. "half-marathon, Sept 20,
// sub-1:45") lets the coach periodize.
//
// The plan comes back as structured JSON (output_config.format) rather than prose, so the
// targets can be stored as real columns and graded later by run-review. The six-line card text
// is rendered from those same fields, so what you read and what gets graded can't drift apart.
// Every plan is persisted to run_plans (upsert on date — regenerating replaces today's plan).

import Anthropic from "npm:@anthropic-ai/sdk";
import { getServiceClient } from "../_shared/supabase.ts";
import { json, handlePreflight } from "../_shared/cors.ts";
import { normalizeActivityType } from "../_shared/normalizeActivity.ts";
import { dateKey, fmtDur, fmtPace, paceMinKm, renderPlanText, utcMidnight } from "../_shared/coach.ts";

const MODEL = "claude-opus-4-8";

// Claude fills exactly this shape. Nullable fields are null on a rest day.
const PLAN_SCHEMA = {
  type: "object",
  properties: {
    workout_type: {
      type: "string",
      enum: ["easy", "recovery", "tempo", "intervals", "long", "rest"],
    },
    distance_km: {
      type: ["number", "null"],
      description: "Target distance in kilometres. Null for a rest day.",
    },
    pace_min_km_low: {
      type: ["number", "null"],
      description:
        "Fast end of the target pace, in decimal minutes per kilometre (5.5 means 5:30/km). Null for a rest day.",
    },
    pace_min_km_high: {
      type: ["number", "null"],
      description: "Slow end of the target pace, same units. Null for a rest day.",
    },
    hr_low: { type: ["integer", "null"], description: "Low end of target heart rate in bpm. Null for a rest day." },
    hr_high: { type: ["integer", "null"], description: "High end of target heart rate in bpm. Null for a rest day." },
    why: { type: "string", description: "1–2 sentences tied to recent load, recovery or how they feel." },
    reminder: { type: "string", description: "One short cue, e.g. warm-up, hydration, form." },
  },
  required: [
    "workout_type",
    "distance_km",
    "pace_min_km_low",
    "pace_min_km_high",
    "hr_low",
    "hr_high",
    "why",
    "reminder",
  ],
  additionalProperties: false,
} as const;

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY is not set on the function" }, 500);

  let feel = "";
  try {
    const body = await req.json();
    if (typeof body?.feel === "string") feel = body.feel.slice(0, 500);
  } catch (_) { /* no body → fine */ }

  try {
    const client = getServiceClient();
    const now = new Date();
    const since = new Date(now.getTime() - 14 * 86400000).toISOString();

    const [actRes, goalsRes] = await Promise.all([
      client
        .from("activities")
        .select("type, type_group, name, started_at, distance_m, moving_time_s, avg_hr, max_hr")
        .gte("started_at", since)
        .order("started_at", { ascending: false }),
      client.from("goals").select("metric, target_value").eq("metric", "weekly_running_km_goal").maybeSingle(),
    ]);
    if (actRes.error) throw new Error(actRes.error.message);

    const activities = actRes.data ?? [];
    const weeklyRunGoal = goalsRes.data ? Number(goalsRes.data.target_value) : null;

    // Build a compact training summary for the prompt.
    const lines: string[] = [];
    let last7RunKm = 0;
    let last7ActiveHrs = 0;
    let lastRunAt: number | null = null;
    const runAvgHrs: number[] = [];
    const runMaxHrs: number[] = [];
    const sevenAgo = now.getTime() - 7 * 86400000;

    for (const a of activities) {
      const t = new Date(a.started_at).getTime();
      const group = a.type_group ?? normalizeActivityType(a.type);
      const km = (a.distance_m ?? 0) / 1000;
      const isRun = group === "Run";
      if (t >= sevenAgo) {
        last7ActiveHrs += (a.moving_time_s ?? 0) / 3600;
        if (isRun) last7RunKm += km;
      }
      if (isRun && (lastRunAt == null || t > lastRunAt)) lastRunAt = t;
      if (isRun && a.avg_hr) runAvgHrs.push(Number(a.avg_hr));
      if (isRun && a.max_hr) runMaxHrs.push(Number(a.max_hr));

      const day = new Date(a.started_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const parts = [`${day}: ${group}`];
      if (km > 0) parts.push(`${km.toFixed(1)}km`);
      parts.push(fmtDur(a.moving_time_s ?? 0));
      if (isRun) parts.push(`@ ${fmtPace(paceMinKm(a.distance_m ?? 0, a.moving_time_s ?? 0))}`);
      if (a.avg_hr) {
        parts.push(a.max_hr ? `HR ${Math.round(a.avg_hr)}/${Math.round(a.max_hr)}` : `HR ${Math.round(a.avg_hr)}`);
      }
      lines.push("- " + parts.join(" · "));
    }

    const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
    const avgRunHr = mean(runAvgHrs);
    const typicalMaxHr = mean(runMaxHrs);
    const maxHr = Deno.env.get("MAX_HR"); // optional: athlete's known max HR for zone-based targets

    const daysSinceRun = lastRunAt == null ? null : Math.floor((now.getTime() - lastRunAt) / 86400000);
    const raceGoal = Deno.env.get("RACE_GOAL");

    const context = [
      `Today is ${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}.`,
      weeklyRunGoal ? `Weekly running goal: ${weeklyRunGoal} km.` : null,
      `Last 7 days: ${last7RunKm.toFixed(1)} km running, ${last7ActiveHrs.toFixed(1)} h total activity.`,
      daysSinceRun == null ? "No runs in the last 14 days." : `Days since last run: ${daysSinceRun}.`,
      avgRunHr ? `Recent runs (14d) heart rate: avg ~${avgRunHr} bpm${typicalMaxHr ? `, typical max ~${typicalMaxHr} bpm` : ""}.` : null,
      maxHr ? `Athlete's known max heart rate: ${maxHr} bpm.` : "Max heart rate unknown — infer HR zones from recent run HR.",
      raceGoal ? `Race goal: ${raceGoal}.` : "No specific race goal — train for general fitness and the weekly km goal.",
      feel ? `Athlete note on how they feel today: "${feel}".` : "No note on how they feel today.",
      "",
      "Activities in the last 14 days (most recent first):",
      lines.length ? lines.join("\n") : "(none)",
    ].filter((l) => l !== null).join("\n");

    const system =
      "You are an experienced, pragmatic running coach. Based on the athlete's recent training, " +
      "recovery, weekly goal, any race goal, and how they feel today, recommend exactly ONE run for " +
      "today. Consider training load and rest — a recovery/easy day or full rest is a valid answer if " +
      "warranted. If a race goal is given, periodize toward it (build vs. taper). Never invent data or " +
      "activities that aren't listed.\n\n" +
      "Set the target heart rate to match the workout intensity. If the athlete's max heart rate is " +
      "given, use standard zones (recovery/easy ~65–75%, tempo ~80–88%, intervals ~90–95% of max). If " +
      "it is unknown, estimate the range from their recent run heart rates.\n\n" +
      "For a rest day set workout_type to 'rest' and leave distance_km, both pace fields and both HR " +
      "fields null. Pace is decimal minutes per kilometre: 5.5 means 5:30/km.";

    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system,
      output_config: { format: { type: "json_schema", schema: PLAN_SCHEMA } },
      messages: [{ role: "user", content: context }],
    });

    // output_config.format guarantees a text block holding valid JSON.
    const raw = msg.content.find((b: { type: string }) => b.type === "text");
    if (!raw) throw new Error("Claude returned no plan");
    const p = JSON.parse((raw as { text: string }).text);

    const planText = renderPlanText(p);
    const today = dateKey(utcMidnight(now));

    const { error: upsertError } = await client.from("run_plans").upsert({
      date: today,
      plan_text: planText,
      workout_type: p.workout_type,
      target_distance_km: p.distance_km,
      target_pace_min_km_low: p.pace_min_km_low,
      target_pace_min_km_high: p.pace_min_km_high,
      target_hr_low: p.hr_low,
      target_hr_high: p.hr_high,
      why: p.why,
      reminder: p.reminder,
      feel: feel || null,
      model: MODEL,
      generated_at: now.toISOString(),
      // Regenerating today's plan invalidates any review already attached to it.
      reviewed_at: null,
      review_text: null,
      adherence: null,
      actual_distance_km: null,
      actual_pace_min_km: null,
      actual_avg_hr: null,
      reviewed_strava_ids: null,
      review_model: null,
    }, { onConflict: "date" });
    if (upsertError) throw new Error(`Failed to save plan: ${upsertError.message}`);

    return json({ plan: planText, date: today, structured: p, model: MODEL, generated_at: now.toISOString() }, 200);
  } catch (e) {
    console.error("run-plan error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

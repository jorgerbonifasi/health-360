// AI running coach: summarizes the last 14 days of training and asks Claude for today's run.
//
// Invoked from the dashboard with the anon key (verify_jwt). Reads activities via the service
// role and calls the Anthropic API with a server-side key (ANTHROPIC_API_KEY) — the key never
// reaches the browser. An optional RACE_GOAL secret (free text, e.g. "half-marathon, Sept 20,
// sub-1:45") lets the coach periodize.

import Anthropic from "npm:@anthropic-ai/sdk";
import { getServiceClient } from "../_shared/supabase.ts";
import { json, handlePreflight } from "../_shared/cors.ts";
import { normalizeActivityType } from "../_shared/normalizeActivity.ts";

const MODEL = "claude-opus-4-8";

function paceMinKm(distanceM: number, movingS: number): number | null {
  const km = distanceM / 1000;
  return km > 0 ? movingS / 60 / km : null;
}
function fmtPace(minKm: number | null): string {
  if (minKm == null || !isFinite(minKm)) return "—";
  const m = Math.floor(minKm);
  const s = Math.round((minKm - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}
function fmtDur(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h${m}m` : `${m}m`;
}

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
        .select("type, type_group, name, started_at, distance_m, moving_time_s, avg_hr")
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

      const day = new Date(a.started_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const parts = [`${day}: ${group}`];
      if (km > 0) parts.push(`${km.toFixed(1)}km`);
      parts.push(fmtDur(a.moving_time_s ?? 0));
      if (isRun) parts.push(`@ ${fmtPace(paceMinKm(a.distance_m ?? 0, a.moving_time_s ?? 0))}`);
      if (a.avg_hr) parts.push(`${Math.round(a.avg_hr)}bpm`);
      lines.push("- " + parts.join(" · "));
    }

    const daysSinceRun = lastRunAt == null ? null : Math.floor((now.getTime() - lastRunAt) / 86400000);
    const raceGoal = Deno.env.get("RACE_GOAL");

    const context = [
      `Today is ${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}.`,
      weeklyRunGoal ? `Weekly running goal: ${weeklyRunGoal} km.` : null,
      `Last 7 days: ${last7RunKm.toFixed(1)} km running, ${last7ActiveHrs.toFixed(1)} h total activity.`,
      daysSinceRun == null ? "No runs in the last 14 days." : `Days since last run: ${daysSinceRun}.`,
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
      "Respond in plain text (no markdown symbols), in this shape, ~5 short lines:\n" +
      "Workout: <easy | recovery | tempo | intervals | long | rest>\n" +
      "Distance: <km, or '—' for rest>\n" +
      "Target pace: <min/km range, or '—'>\n" +
      "Why: <1–2 sentences tied to their recent load / recovery / feel>\n" +
      "Reminder: <one short cue, e.g. warm-up, hydration, form>";

    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system,
      messages: [{ role: "user", content: context }],
    });

    const plan = msg.content
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n")
      .trim();

    return json({ plan, model: MODEL, generated_at: now.toISOString() }, 200);
  } catch (e) {
    console.error("run-plan error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

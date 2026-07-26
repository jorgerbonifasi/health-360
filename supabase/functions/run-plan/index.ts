// AI running coach: summarizes the last 14 days of training and asks Claude for today's run.
//
// Invoked from the dashboard with the anon key (verify_jwt). Reads activities via the service
// role and calls the Anthropic API with a server-side key (ANTHROPIC_API_KEY) — the key never
// reaches the browser. An optional RACE_GOAL secret (free text, e.g. "half-marathon, Sept 20,
// sub-1:45") lets the coach periodize. Optional MAX_HR / RESTING_HR secrets (bpm) anchor the
// heart-rate zones; without MAX_HR the coach falls back to the highest max HR seen in the window.

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
// "148avg/172max bpm", or just the half that exists. Empty string when the activity had no HR.
function fmtHr(avg: number | null, max: number | null): string {
  const parts: string[] = [];
  if (avg) parts.push(`${Math.round(avg)}avg`);
  if (max) parts.push(`${Math.round(max)}max`);
  return parts.length ? `${parts.join("/")} bpm` : "";
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
    // Time-weighted average HR over the last 7 days of running, so a 90-min long run counts more
    // than a 20-min shakeout. Only activities that actually reported HR contribute.
    let last7RunHrTimeS = 0;
    let last7RunHrBeats = 0;
    let peakHr14 = 0;
    const sevenAgo = now.getTime() - 7 * 86400000;

    for (const a of activities) {
      const t = new Date(a.started_at).getTime();
      const group = a.type_group ?? normalizeActivityType(a.type);
      const km = (a.distance_m ?? 0) / 1000;
      const isRun = group === "Run";
      if (t >= sevenAgo) {
        last7ActiveHrs += (a.moving_time_s ?? 0) / 3600;
        if (isRun) {
          last7RunKm += km;
          if (a.avg_hr && a.moving_time_s) {
            last7RunHrTimeS += a.moving_time_s;
            last7RunHrBeats += Number(a.avg_hr) * a.moving_time_s;
          }
        }
      }
      if (isRun && (lastRunAt == null || t > lastRunAt)) lastRunAt = t;
      // Peak across every sport — the highest HR the athlete has actually hit is the best
      // available anchor for zones when MAX_HR isn't configured.
      if (a.max_hr) peakHr14 = Math.max(peakHr14, Number(a.max_hr));

      const day = new Date(a.started_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const parts = [`${day}: ${group}`];
      if (km > 0) parts.push(`${km.toFixed(1)}km`);
      parts.push(fmtDur(a.moving_time_s ?? 0));
      if (isRun) parts.push(`@ ${fmtPace(paceMinKm(a.distance_m ?? 0, a.moving_time_s ?? 0))}`);
      const hr = fmtHr(a.avg_hr, a.max_hr);
      if (hr) parts.push(hr);
      lines.push("- " + parts.join(" · "));
    }

    const last7AvgRunHr = last7RunHrTimeS > 0 ? last7RunHrBeats / last7RunHrTimeS : null;

    const daysSinceRun = lastRunAt == null ? null : Math.floor((now.getTime() - lastRunAt) / 86400000);
    const raceGoal = Deno.env.get("RACE_GOAL");
    const maxHr = Number(Deno.env.get("MAX_HR")) || null;
    const restingHr = Number(Deno.env.get("RESTING_HR")) || null;

    // Zone anchor: a configured lab/field max wins; otherwise the observed 14-day peak, clearly
    // labelled so the coach knows it's a floor on the true max, not the max itself.
    const hrAnchor = maxHr
      ? `Max HR: ${Math.round(maxHr)} bpm (configured). Base heart-rate zones on this.`
      : peakHr14 > 0
        ? `No configured max HR. Highest HR recorded in the last 14 days: ${Math.round(peakHr14)} bpm — ` +
          `treat this as a lower bound on true max HR and be conservative when setting zones.`
        : "No heart-rate data available — give the HR range as '—' and cue effort by feel instead.";

    const context = [
      `Today is ${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}.`,
      weeklyRunGoal ? `Weekly running goal: ${weeklyRunGoal} km.` : null,
      `Last 7 days: ${last7RunKm.toFixed(1)} km running, ${last7ActiveHrs.toFixed(1)} h total activity.`,
      last7AvgRunHr
        ? `Average running HR over the last 7 days (time-weighted): ${Math.round(last7AvgRunHr)} bpm.`
        : null,
      restingHr ? `Resting HR: ${Math.round(restingHr)} bpm.` : null,
      hrAnchor,
      daysSinceRun == null ? "No runs in the last 14 days." : `Days since last run: ${daysSinceRun}.`,
      raceGoal ? `Race goal: ${raceGoal}.` : "No specific race goal — train for general fitness and the weekly km goal.",
      feel ? `Athlete note on how they feel today: "${feel}".` : "No note on how they feel today.",
      "",
      "Activities in the last 14 days (most recent first; HR shown as avg/max where recorded):",
      lines.length ? lines.join("\n") : "(none)",
    ].filter((l) => l !== null).join("\n");

    const system =
      "You are an experienced, pragmatic running coach. Based on the athlete's recent training, " +
      "heart-rate data, recovery, weekly goal, any race goal, and how they feel today, recommend " +
      "exactly ONE run for today. Consider training load and rest — a recovery/easy day or full rest " +
      "is a valid answer if warranted. If a race goal is given, periodize toward it (build vs. " +
      "taper). Never invent data or activities that aren't listed.\n\n" +
      "Give a target heart-rate range in bpm for the session, derived from the max HR you are given " +
      "(roughly: recovery 60–70%, easy 65–75%, tempo 80–88%, intervals 88–95% of max HR). Keep the " +
      "range about 10–15 bpm wide. If HR data is missing or the anchor is only an observed peak, say " +
      "so briefly and stay conservative. Use '—' for the HR range on a rest day.\n\n" +
      "Respond in plain text (no markdown symbols), in this shape, ~6 short lines:\n" +
      "Workout: <easy | recovery | tempo | intervals | long | rest>\n" +
      "Distance: <km, or '—' for rest>\n" +
      "Target pace: <min/km range, or '—'>\n" +
      "Target HR: <bpm range, e.g. 135–150 bpm, or '—' for rest>\n" +
      "Why: <1–2 sentences tied to their recent load / HR trend / recovery / feel>\n" +
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

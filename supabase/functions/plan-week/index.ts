// Weekly plan: asks Claude to lay out the rest of the training week toward the weekly km goal and
// stores one run_plans row per day (the same table the daily coach and the review use, so a day's
// plan, its review and the week view all share one record).
//
// Invoked from the Plan tab with the anon key. Plans from today forward (from tomorrow if you have
// already run today, and through next Sunday when the week is nearly over). Days that have already
// been reviewed are never overwritten. The km goal is a target, not an obligation: the prompt makes
// the coach ramp from what you have actually been running.

import Anthropic from "npm:@anthropic-ai/sdk";
import { getServiceClient } from "../_shared/supabase.ts";
import { json, handlePreflight } from "../_shared/cors.ts";
import { normalizeActivityType } from "../_shared/normalizeActivity.ts";
import { dateKey, fmtDur, fmtPace, fmtPaceRange, paceMinKm, renderPlanText, utcMidnight } from "../_shared/coach.ts";

const MODEL = "claude-opus-4-8";
const DAY = 86400000;
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
// Monday-based weekday index (Mon = 0), UTC.
const dow = (d: Date) => (d.getUTCDay() + 6) % 7;

const DAY_SCHEMA = {
  type: "object",
  properties: {
    date: { type: "string", description: "The date being planned, YYYY-MM-DD, exactly as listed." },
    workout_type: { type: "string", enum: ["easy", "recovery", "tempo", "intervals", "long", "rest"] },
    distance_km: { type: ["number", "null"], description: "Target distance in km. Null for a rest day." },
    pace_min_km_low: { type: ["number", "null"], description: "Fast end of the pace range, decimal min/km (5.5 = 5:30/km). Null on rest." },
    pace_min_km_high: { type: ["number", "null"], description: "Slow end of the pace range. Null on rest." },
    hr_low: { type: ["integer", "null"], description: "Low end of target HR in bpm. Null on rest." },
    hr_high: { type: ["integer", "null"], description: "High end of target HR in bpm. Null on rest." },
    why: { type: "string", description: "One sentence on what this day is for in the week." },
    reminder: { type: "string", description: "One short cue." },
  },
  required: ["date", "workout_type", "distance_km", "pace_min_km_low", "pace_min_km_high", "hr_low", "hr_high", "why", "reminder"],
  additionalProperties: false,
} as const;

const WEEK_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "1-2 sentences on the shape of the week and how it relates to the km goal. Do NOT quote km totals or percentages; the app computes those." },
    days: { type: "array", items: DAY_SCHEMA },
  },
  required: ["summary", "days"],
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
  } catch (_) { /* no body is fine */ }

  try {
    const client = getServiceClient();
    const now = new Date();
    const today = utcMidnight(now);
    const monday = addDays(today, -dow(today));

    const [actRes, goalRes, histRes] = await Promise.all([
      client
        .from("activities")
        .select("type, type_group, name, started_at, distance_m, moving_time_s, avg_hr, max_hr")
        .gte("started_at", addDays(monday, -28).toISOString())
        .order("started_at", { ascending: false }),
      client.from("goals").select("target_value").eq("metric", "weekly_running_km_goal").maybeSingle(),
      client
        .from("run_plans")
        .select("date, workout_type, target_distance_km, target_pace_min_km_low, target_pace_min_km_high, adherence, review_text, actual_distance_km, actual_pace_min_km, actual_avg_hr")
        .lt("date", dateKey(today))
        .not("reviewed_at", "is", null)
        .order("date", { ascending: false })
        .limit(5),
    ]);
    if (actRes.error) throw new Error(actRes.error.message);
    const activities = actRes.data ?? [];
    const history = histRes.error ? [] : (histRes.data ?? []);
    const goalKm = goalRes.data ? Number(goalRes.data.target_value) : null;

    const isRun = (a: { type_group?: string | null; type: string }) => (a.type_group ?? normalizeActivityType(a.type)) === "Run";
    const ranToday = activities.some((a) => isRun(a) && dateKey(new Date(a.started_at)) === dateKey(today));

    // Which days to plan: today onward (tomorrow if you've run today), to this Sunday - or through
    // next Sunday when fewer than two days of this week remain.
    let first = ranToday ? addDays(today, 1) : today;
    let last = addDays(monday, 6);
    if ((last.getTime() - first.getTime()) / DAY < 1) last = addDays(monday, 13);
    const dates: string[] = [];
    for (let d = first; d <= last; d = addDays(d, 1)) dates.push(dateKey(d));

    // Weekly run km for the last four weeks and this one so far.
    const weekKm = (offset: number) => {
      const start = addDays(monday, offset * 7).getTime();
      return activities
        .filter((a) => isRun(a) && new Date(a.started_at).getTime() >= start && new Date(a.started_at).getTime() < start + 7 * DAY)
        .reduce((s, a) => s + (a.distance_m ?? 0) / 1000, 0);
    };
    const weeklyLines = [-4, -3, -2, -1, 0].map((o) =>
      `- ${o === 0 ? "This week so far" : `${-o} week${o === -1 ? "" : "s"} ago`}: ${weekKm(o).toFixed(1)} km`
    );
    const recentAvg = [-3, -2, -1].map(weekKm).reduce((s, x) => s + x, 0) / 3;
    // Anchor on what the athlete has actually shown, not a 3-week average that low weeks drag down.
    const bestRecentWeek = Math.max(...[-4, -3, -2, -1].map(weekKm));
    const runKms = activities.filter(isRun).map((a) => (a.distance_m ?? 0) / 1000).filter((k) => k > 0).sort((a, b) => a - b);
    const longestRun = runKms.length ? runKms[runKms.length - 1] : 0;
    const typicalRun = runKms.length ? runKms[Math.floor(runKms.length / 2)] : 0;

    // Km already run on days inside the planned window (before today). When the window is next week
    // that is zero, so this week's km must not be counted toward it.
    const windowStartMs = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());
    const windowMonday = addDays(first, -dow(first));
    const windowSoFarKm = activities
      .filter((a) => isRun(a) && new Date(a.started_at).getTime() >= windowMonday.getTime() && new Date(a.started_at).getTime() < windowStartMs)
      .reduce((s, a) => s + (a.distance_m ?? 0) / 1000, 0);
    const windowIsNextWeek = windowMonday.getTime() > monday.getTime();

    const lines = activities
      .filter((a) => new Date(a.started_at).getTime() >= today.getTime() - 14 * DAY)
      .map((a) => {
        const group = a.type_group ?? normalizeActivityType(a.type);
        const km = (a.distance_m ?? 0) / 1000;
        const day = new Date(a.started_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        const parts = [`${day}: ${group}`];
        if (km > 0) parts.push(`${km.toFixed(1)}km`);
        parts.push(fmtDur(a.moving_time_s ?? 0));
        if (group === "Run") parts.push(`@ ${fmtPace(paceMinKm(a.distance_m ?? 0, a.moving_time_s ?? 0))}`);
        if (a.avg_hr) parts.push(`HR ${Math.round(a.avg_hr)}${a.max_hr ? `/${Math.round(a.max_hr)}` : ""}`);
        return "- " + parts.join(" · ");
      });

    const historyLines = history.map((h) => {
      const asked = h.workout_type === "rest" ? "rest" : `${h.workout_type} ${h.target_distance_km ?? "?"}km @ ${fmtPaceRange(h.target_pace_min_km_low, h.target_pace_min_km_high)}`;
      const did = h.actual_distance_km != null
        ? `ran ${Number(h.actual_distance_km).toFixed(1)}km @ ${fmtPace(h.actual_pace_min_km)}${h.actual_avg_hr ? `, HR ${Math.round(h.actual_avg_hr)}` : ""}`
        : "no run recorded";
      return `- ${h.date}: asked ${asked}; ${did}; verdict: ${h.adherence}. ${h.review_text ?? ""}`.trim();
    });

    const maxHr = Deno.env.get("MAX_HR");
    const raceGoal = Deno.env.get("RACE_GOAL");

    const context = [
      `Today is ${WEEKDAYS[dow(today)]} ${dateKey(today)}.`,
      windowIsNextWeek
        ? "The dates below are NEXT week (Monday to Sunday). Km run this week do not count toward that week."
        : `The dates below finish this week. Km already run earlier this week, before the first date: ${windowSoFarKm.toFixed(1)} km.`,
      `Plan exactly these dates, one entry each, in order:`,
      ...dates.map((d) => `- ${d} (${WEEKDAYS[dow(new Date(`${d}T00:00:00Z`))]})`),
      "",
      goalKm ? `Weekly running goal: ${goalKm} km.` : "No weekly km goal set.",
      `Recent weekly average (last 3 full weeks): ${recentAvg.toFixed(1)} km. Best of the last 4 full weeks: ${bestRecentWeek.toFixed(1)} km.`,
      `Longest single run in the last 5 weeks: ${longestRun.toFixed(1)} km. Typical run: ${typicalRun.toFixed(1)} km.`,
      "Run km per week:",
      ...weeklyLines,
      maxHr ? `Known max heart rate: ${maxHr} bpm.` : "Max heart rate unknown - infer HR ranges from recent run HR.",
      raceGoal ? `Race goal: ${raceGoal}.` : "No race goal - train for general fitness and the weekly km goal.",
      feel ? `Athlete note: "${feel}".` : null,
      "",
      historyLines.length ? "How your recent prescriptions went (most recent first):\n" + historyLines.join("\n") : "No graded history yet.",
      "",
      "Activities in the last 14 days (most recent first, includes non-running):",
      lines.length ? lines.join("\n") : "(none)",
    ].filter((l) => l !== null).join("\n");

    const system =
      "You are an experienced, pragmatic running coach planning the rest of an athlete's training week. " +
      "Return exactly one entry for each listed date and nothing else.\n\n" +
      "The weekly km goal is a TARGET, not an obligation. Build from the athlete's BEST recent week, not " +
      "their average: plan a total roughly 5-15% above the best of the last four full weeks, and never " +
      "below it unless the history shows they are run down. Say in the summary how far the plan gets " +
      "toward the goal. Count km already run this week. Use rest days freely, but do not under-plan: aim " +
      "for three or four runs a week when recent weeks allow it. Run lengths must reflect what they have " +
      "already shown they can do: include one longer run of roughly 70-100% of their longest recent run " +
      "(put it on a weekend day if one is listed), and make the other runs about their typical run " +
      "length, not a fraction of it. Do not schedule a week of runs far shorter than their recent single " +
      "runs. Plan at most one hard session (tempo or intervals) in the week and follow it with a rest or " +
      "easy day. Treat racket sports and other activity as real load - do not put a hard run the day " +
      "after a long or intense non-running session. When graded history is given, learn from it: if easy " +
      "days keep coming in too hard, set a firmer HR cap rather than shrinking the distance; if the plan " +
      "is being followed well, keep building. Never " +
      "invent activities that aren't listed.\n\n" +
      "Set target heart rate to match intensity: with a known max HR use standard zones (easy ~65-75%, " +
      "tempo ~80-88%, intervals ~90-95%); otherwise infer from recent run heart rates. For a rest day set " +
      "workout_type to 'rest' and leave distance, pace and HR null. Pace is decimal minutes per " +
      "kilometre (5.5 = 5:30/km).";

    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system,
      output_config: { format: { type: "json_schema", schema: WEEK_SCHEMA } },
      messages: [{ role: "user", content: context }],
    });

    const raw = msg.content.find((b: { type: string }) => b.type === "text");
    if (!raw) throw new Error("Claude returned no plan");
    const parsed = JSON.parse((raw as { text: string }).text) as { summary: string; days: Array<Record<string, any>> };

    // Keep only listed dates, one per date, in order. Never trust the model with the rest rule.
    const allowed = new Set(dates);
    const seen = new Set<string>();
    const days = parsed.days
      .filter((d) => allowed.has(d.date) && !seen.has(d.date) && seen.add(d.date))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => d.workout_type === "rest"
        ? { ...d, distance_km: null, pace_min_km_low: null, pace_min_km_high: null, hr_low: null, hr_high: null }
        : d);
    if (days.length === 0) throw new Error("Claude returned no usable days");

    // Don't clobber a day that has already been reviewed; keep any note typed for today.
    const { data: existing, error: exErr } = await client
      .from("run_plans")
      .select("date, reviewed_at, feel")
      .in("date", days.map((d) => d.date));
    if (exErr) throw new Error(exErr.message);
    const exMap = new Map((existing ?? []).map((r) => [r.date as string, r]));

    const rows = days
      .filter((d) => !exMap.get(d.date)?.reviewed_at)
      .map((p) => ({
        date: p.date,
        plan_text: renderPlanText(p as any),
        workout_type: p.workout_type,
        target_distance_km: p.distance_km,
        target_pace_min_km_low: p.pace_min_km_low,
        target_pace_min_km_high: p.pace_min_km_high,
        target_hr_low: p.hr_low,
        target_hr_high: p.hr_high,
        why: p.why,
        reminder: p.reminder,
        feel: p.date === dateKey(today) ? (feel || exMap.get(p.date)?.feel || null) : null,
        model: MODEL,
        generated_at: now.toISOString(),
        reviewed_at: null,
        review_text: null,
        adherence: null,
        actual_distance_km: null,
        actual_pace_min_km: null,
        actual_avg_hr: null,
        reviewed_strava_ids: null,
        review_model: null,
      }));

    const { error: upErr } = await client.from("run_plans").upsert(rows, { onConflict: "date" });
    if (upErr) throw new Error(`Failed to save week plan: ${upErr.message}`);

    const plannedKm = days.reduce((s, d) => s + (Number(d.distance_km) || 0), 0);
    return json({
      summary: parsed.summary,
      planned_dates: rows.map((r) => r.date),
      planned_km: Math.round(plannedKm * 10) / 10,
      km_so_far: Math.round(windowSoFarKm * 10) / 10,
      window: windowIsNextWeek ? "next_week" : "this_week",
      goal_km: goalKm,
      model: MODEL,
    }, 200);
  } catch (e) {
    console.error("plan-week error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

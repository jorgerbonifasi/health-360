// Post-run review: grades a stored coach plan against what the athlete actually did.
//
// Invoked on demand from the dashboard ("How did <day> go?") with the anon key. With no body it
// picks the most recent plan that has not been reviewed yet; pass {"date":"YYYY-MM-DD"} to review
// (or re-review) a specific day.
//
// The numbers are computed here from `activities` — the model is only asked for the judgement
// (review_text + adherence), never for figures it could get wrong. Runs on Sonnet because
// comparing a prescription to a result is a much easier task than writing the prescription.

import Anthropic from "npm:@anthropic-ai/sdk";
import { getServiceClient } from "../_shared/supabase.ts";
import { json, handlePreflight } from "../_shared/cors.ts";
import { normalizeActivityType } from "../_shared/normalizeActivity.ts";
import { dateKey, fmtDur, fmtPace, paceMinKm, utcMidnight } from "../_shared/coach.ts";

const MODEL = "claude-sonnet-5-5";

// Must stay in step with the run_plans_adherence_check constraint.
const ADHERENCE = [
  "followed",
  "harder",
  "easier",
  "skipped",
  "cross_trained",
  "rest_as_planned",
  "extra",
] as const;

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    adherence: {
      type: "string",
      enum: ADHERENCE,
      description:
        "followed = broadly did what was asked; harder/easier = ran but meaningfully above/below " +
        "the prescription; skipped = a run was prescribed and nothing happened; cross_trained = " +
        "trained but not the prescribed run; rest_as_planned = rest prescribed and taken; " +
        "extra = rest was prescribed but they trained anyway.",
    },
    review_text: {
      type: "string",
      description:
        "2-4 sentences, second person, plain text. Say what was prescribed vs what happened, " +
        "whether that was the right call, and one thing to carry into the next run.",
    },
  },
  required: ["adherence", "review_text"],
  additionalProperties: false,
} as const;

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY is not set on the function" }, 500);

  let wantedDate: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) wantedDate = body.date;
  } catch (_) { /* no body -> review the most recent outstanding plan */ }

  try {
    const client = getServiceClient();
    const now = new Date();
    const today = dateKey(utcMidnight(now));

    // --- Pick the plan to review -------------------------------------------------
    // An explicit date may be today (the athlete has already run and wants the verdict now); the
    // default deliberately stops at yesterday, since today's training day isn't over yet. This
    // matches what the card offers.
    const planQuery = wantedDate
      ? client.from("run_plans").select("*").lte("date", today).eq("date", wantedDate)
      : client.from("run_plans").select("*").lt("date", today)
        .is("reviewed_at", null).order("date", { ascending: false }).limit(1);

    const { data: plans, error: planError } = await planQuery;
    if (planError) throw new Error(planError.message);

    const plan = plans?.[0];
    if (!plan) {
      return json(
        wantedDate
          ? { ok: false, error: `No plan stored for ${wantedDate}.` }
          : { ok: true, nothing_to_review: true },
        wantedDate ? 404 : 200,
      );
    }

    // --- What actually happened that day ------------------------------------------
    const dayStart = new Date(`${plan.date}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 86400000);

    const { data: acts, error: actError } = await client
      .from("activities")
      .select("strava_id, type, type_group, name, started_at, distance_m, moving_time_s, avg_hr, max_hr")
      .gte("started_at", dayStart.toISOString())
      .lt("started_at", dayEnd.toISOString())
      .order("started_at", { ascending: true });
    if (actError) throw new Error(actError.message);

    const activities = acts ?? [];
    const runs = activities.filter((a) => (a.type_group ?? normalizeActivityType(a.type)) === "Run");

    const totalDistM = runs.reduce((s, a) => s + Number(a.distance_m ?? 0), 0);
    const totalMovingS = runs.reduce((s, a) => s + Number(a.moving_time_s ?? 0), 0);
    const actualDistanceKm = runs.length ? totalDistM / 1000 : null;
    const actualPace = runs.length ? paceMinKm(totalDistM, totalMovingS) : null;

    // Time-weighted mean HR across the runs that recorded it.
    const hrRuns = runs.filter((a) => a.avg_hr != null && Number(a.moving_time_s ?? 0) > 0);
    const hrWeight = hrRuns.reduce((s, a) => s + Number(a.moving_time_s), 0);
    const actualAvgHr = hrWeight > 0
      ? hrRuns.reduce((s, a) => s + Number(a.avg_hr) * Number(a.moving_time_s), 0) / hrWeight
      : null;

    const actualLines = activities.length
      ? activities.map((a) => {
        const group = a.type_group ?? normalizeActivityType(a.type);
        const km = Number(a.distance_m ?? 0) / 1000;
        const parts = [group];
        if (km > 0) parts.push(`${km.toFixed(1)}km`);
        parts.push(fmtDur(Number(a.moving_time_s ?? 0)));
        if (group === "Run") parts.push(`@ ${fmtPace(paceMinKm(Number(a.distance_m ?? 0), Number(a.moving_time_s ?? 0)))}`);
        if (a.avg_hr) parts.push(a.max_hr ? `HR ${Math.round(Number(a.avg_hr))}/${Math.round(Number(a.max_hr))}` : `HR ${Math.round(Number(a.avg_hr))}`);
        return `- ${parts.join(" · ")}${a.name ? ` ("${a.name}")` : ""}`;
      }).join("\n")
      : "(nothing recorded - no activity at all that day)";

    const planDay = new Date(`${plan.date}T12:00:00.000Z`)
      .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

    const context = [
      `Plan date: ${planDay}.`,
      plan.feel ? `Before the session the athlete said: "${plan.feel}".` : null,
      "",
      "What the coach prescribed:",
      plan.plan_text,
      "",
      "What the athlete actually did that day:",
      actualLines,
    ].filter((l) => l !== null).join("\n");

    const system =
      "You are the same pragmatic running coach who wrote the prescription, now reviewing how the " +
      "day went. Compare what was prescribed with what was actually done and give short, honest, " +
      "useful feedback.\n\n" +
      "Be fair about what the data can tell you: a missing activity means nothing was recorded, " +
      "which usually means it was not done, but say so as an observation rather than an accusation. " +
      "If rest was prescribed and nothing happened, that is a success, not a failure. If they ran " +
      "much harder than an easy day called for, say so plainly - that is the most common and most " +
      "costly mistake. Never invent splits, heart rates or distances that are not listed. Address " +
      "the athlete as 'you'.";

    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system,
      output_config: { format: { type: "json_schema", schema: REVIEW_SCHEMA } },
      messages: [{ role: "user", content: context }],
    });

    const raw = msg.content.find((b: { type: string }) => b.type === "text");
    if (!raw) throw new Error("Claude returned no review");
    const r = JSON.parse((raw as { text: string }).text);

    const { error: updateError } = await client
      .from("run_plans")
      .update({
        reviewed_at: now.toISOString(),
        review_text: r.review_text,
        adherence: r.adherence,
        actual_distance_km: actualDistanceKm,
        actual_pace_min_km: actualPace,
        actual_avg_hr: actualAvgHr,
        reviewed_strava_ids: activities.map((a) => a.strava_id),
        review_model: MODEL,
      })
      .eq("date", plan.date);
    if (updateError) throw new Error(`Failed to save review: ${updateError.message}`);

    return json({
      ok: true,
      date: plan.date,
      adherence: r.adherence,
      review_text: r.review_text,
      actual_distance_km: actualDistanceKm,
      actual_pace_min_km: actualPace,
      actual_avg_hr: actualAvgHr,
      model: MODEL,
    }, 200);
  } catch (e) {
    console.error("run-review error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// Source watchdog: notices when a data source has gone quiet and pushes a phone notification.
//
// Invoked nightly by pg_cron (after reconcile/compute-scores). Sends via ntfy.sh to the topic in
// the NTFY_TOPIC secret; with no topic set it just reports what it would have sent. Pass ?dry=1
// to skip sending.
//
// Stateless on purpose: a stale-data alert fires only on specific day counts (STALE_DAYS), so a
// daily cron sends each one once instead of nagging every night. A broken *integration* (Strava
// rejecting our API app) is different — that alerts every night until it is fixed.

import { getServiceClient } from "../_shared/supabase.ts";
import { json, handlePreflight } from "../_shared/cors.ts";
import { dateKey, utcMidnight } from "../_shared/coach.ts";

const DAY = 86400000;

// Days of silence at which to alert. Steps arrive daily; weigh-ins are sporadic; activities
// depend on how often you train.
const STALE_DAYS = {
  steps: [2, 5, 10, 21, 45],
  weight: [14, 30, 60],
  strava: [7, 14, 30],
};

function daysBetween(fromKey: string, today: Date): number {
  return Math.round((today.getTime() - new Date(`${fromKey}T00:00:00Z`).getTime()) / DAY);
}

// Strava rejects every call when the API app is deactivated (this happened 28-31 Jul 2026), and
// a rest week looks identical in the data — so probe the app itself rather than inferring.
async function stravaAppProblem(): Promise<string | null> {
  const id = Deno.env.get("STRAVA_CLIENT_ID");
  const secret = Deno.env.get("STRAVA_CLIENT_SECRET");
  if (!id || !secret) return null;
  const res = await fetch(
    `https://www.strava.com/api/v3/push_subscriptions?client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}`,
  );
  if (res.ok) return null;
  const body = await res.text();
  return `Strava is rejecting our API app (HTTP ${res.status}). ${body.slice(0, 120)}`;
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const dry = new URL(req.url).searchParams.get("dry") === "1";
    const client = getServiceClient();
    const today = utcMidnight(new Date());

    const [steps, weight, act] = await Promise.all([
      client.from("daily_steps").select("date").order("date", { ascending: false }).limit(1),
      client.from("weight_logs").select("measured_at").order("measured_at", { ascending: false }).limit(1),
      client.from("activities").select("started_at").order("started_at", { ascending: false }).limit(1),
    ]);
    for (const r of [steps, weight, act]) if (r.error) throw new Error(r.error.message);

    const alerts: string[] = [];

    const lastSteps = steps.data?.[0]?.date as string | undefined;
    if (lastSteps) {
      const d = daysBetween(lastSteps, today);
      if (STALE_DAYS.steps.includes(d)) {
        alerts.push(`No steps for ${d} days. Check the Health Auto Export automation on your iPhone (URL, Health permission, background refresh).`);
      }
    }

    const lastWeigh = weight.data?.[0]?.measured_at as string | undefined;
    if (lastWeigh) {
      const d = daysBetween(lastWeigh.slice(0, 10), today);
      if (STALE_DAYS.weight.includes(d)) alerts.push(`No weigh-in for ${d} days. The Weight score is excluded until the next one.`);
    }

    const lastAct = act.data?.[0]?.started_at as string | undefined;
    if (lastAct) {
      const d = daysBetween(lastAct.slice(0, 10), today);
      if (STALE_DAYS.strava.includes(d)) alerts.push(`No Strava activity for ${d} days. A rest week, or a broken sync?`);
    }

    const strava = await stravaAppProblem();
    if (strava) alerts.push(strava);

    const topic = Deno.env.get("NTFY_TOPIC");
    let sent = false;
    if (alerts.length && topic && !dry) {
      const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
        method: "POST",
        headers: { Title: "Health 360 needs attention", Priority: "high", Tags: "warning" },
        body: alerts.map((a) => `• ${a}`).join("\n"),
      });
      if (!res.ok) throw new Error(`ntfy responded ${res.status}`);
      sent = true;
    }

    return json({
      ok: true,
      checked: dateKey(today),
      latest: { steps: lastSteps ?? null, weight: lastWeigh ?? null, activity: lastAct ?? null },
      alerts,
      sent,
      notifier: topic ? "ntfy" : "none (NTFY_TOPIC not set)",
    }, 200);
  } catch (e) {
    console.error("check-sources error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// Nightly reconciliation: backfill the last 7 days from Strava + Withings in case any webhook
// was missed. Everything here is idempotent (upsert on the same unique keys the webhooks use),
// so re-running is always safe. Invoked by pg_cron (see 0002_cron.sql) or manually.

import { getServiceClient } from "../_shared/supabase.ts";
import { listActivitiesAfter, stravaActivityToRow, upsertActivities } from "../_shared/strava.ts";
import { getMeasures, measureGroupToRow, upsertWeights } from "../_shared/withings.ts";
import { json, handlePreflight } from "../_shared/cors.ts";

const DEFAULT_WINDOW_DAYS = 7;
const MAX_WINDOW_DAYS = 365;

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  const client = getServiceClient();

  // Nightly cron uses the 7-day default; pass ?days=N (or {"days":N}) for a wider one-time backfill.
  let days = DEFAULT_WINDOW_DAYS;
  const qDays = new URL(req.url).searchParams.get("days");
  if (qDays) days = Number(qDays);
  else {
    try {
      const body = await req.json();
      if (body?.days) days = Number(body.days);
    } catch (_) { /* no/invalid body → keep default */ }
  }
  if (!Number.isFinite(days) || days <= 0) days = DEFAULT_WINDOW_DAYS;
  days = Math.min(days, MAX_WINDOW_DAYS);

  const now = Math.floor(Date.now() / 1000);
  const since = now - days * 86400;

  const result: Record<string, unknown> = {};

  // --- Strava activities ---
  try {
    const activities = await listActivitiesAfter(client, since);
    const rows = activities.map(stravaActivityToRow);
    await upsertActivities(client, rows);
    result.strava_activities = rows.length;
  } catch (e) {
    console.error("reconcile strava error", e);
    result.strava_error = e instanceof Error ? e.message : String(e);
  }

  // --- Withings weights ---
  try {
    const groups = await getMeasures(client, since, now);
    const rows = groups
      .map(measureGroupToRow)
      .filter((r): r is Record<string, unknown> => r !== null);
    await upsertWeights(client, rows);
    result.withings_weights = rows.length;
  } catch (e) {
    console.error("reconcile withings error", e);
    result.withings_error = e instanceof Error ? e.message : String(e);
  }

  return json({ ok: true, window_days: days, ...result }, 200);
});

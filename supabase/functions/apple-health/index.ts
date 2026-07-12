// Apple Health ingestion endpoint for the "Health Auto Export" iOS app (REST API / JSON export).
//
// Expected body shape (Health Auto Export "JSON" format):
//   { "data": { "metrics": [ { "name": "step_count", "units": "count",
//        "data": [ { "date": "2026-07-11 00:00:00 +0000", "qty": 8452, "source": "iPhone" } ] },
//        ...other metrics ] } }
//
// We only consume the `step_count` metric here. Entries are summed per calendar day (the app
// may send hourly buckets depending on its aggregation setting) and upserted into daily_steps.
//
// This endpoint is public, so it is gated by a shared secret: send it as ?token=... or the
// X-Token header, matching APPLE_HEALTH_TOKEN. Deploy with verify_jwt = false.

import { getServiceClient } from "../_shared/supabase.ts";
import { json, handlePreflight } from "../_shared/cors.ts";

// "2026-07-11 00:00:00 +0000" | ISO 8601 → "YYYY-MM-DD"
function toDateKey(raw: string): string | null {
  const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // --- Auth: shared secret ---
  const expected = Deno.env.get("APPLE_HEALTH_TOKEN");
  const url = new URL(req.url);
  const provided = url.searchParams.get("token") ?? req.headers.get("x-token");
  if (!expected || provided !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: any = null;
  try {
    payload = await req.json();
  } catch (_) {
    return json({ error: "invalid json" }, 400);
  }

  const metrics: any[] = payload?.data?.metrics ?? [];
  const stepMetric = metrics.find((m) => m?.name === "step_count");
  if (!stepMetric) {
    // Nothing to do — acknowledge so the app doesn't retry forever.
    return json({ received: true, steps_upserted: 0, note: "no step_count metric" }, 200);
  }

  // Sum quantities per calendar day.
  const perDay = new Map<string, number>();
  for (const entry of stepMetric.data ?? []) {
    const date = toDateKey(entry?.date);
    const qty = Number(entry?.qty);
    if (!date || !Number.isFinite(qty)) continue;
    perDay.set(date, (perDay.get(date) ?? 0) + qty);
  }

  const rows = [...perDay.entries()].map(([date, steps]) => ({
    date,
    steps: Math.round(steps),
    source: "apple_health",
    raw: { date, entries: (stepMetric.data ?? []).filter((e: any) => toDateKey(e?.date) === date) },
  }));

  if (rows.length === 0) {
    return json({ received: true, steps_upserted: 0 }, 200);
  }

  try {
    const client = getServiceClient();
    const { error } = await client
      .from("daily_steps")
      .upsert(rows, { onConflict: "source,date" });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error("apple-health upsert error", e);
    return json({ error: "failed to store steps", detail: e instanceof Error ? e.message : String(e) }, 500);
  }

  return json({ received: true, steps_upserted: rows.length }, 200);
});

// Update tunable goals/pillar-weights from the dashboard's settings panel.
//
// Invoked with the anon key (verify_jwt) and writes via the service role, so the read-only RLS
// model stays intact. Only an allow-list of metrics can be changed, and values must be finite.
//
// Body: { "updates": [ { "metric": "daily_step_goal", "target_value": 12000 },
//                       { "metric": "target_weight", "target_value": 72.5, "direction": "down" } ] }

import { getServiceClient } from "../_shared/supabase.ts";
import { json, handlePreflight } from "../_shared/cors.ts";

const ALLOWED = new Set([
  "daily_step_goal",
  "weekly_active_hours_goal",
  "weekly_running_km_goal",
  "target_weight",
  "pillar_weight_movement",
  "pillar_weight_exercise",
  "pillar_weight_weight",
  "score_cap_ratio",
]);

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "invalid json" }, 400);
  }

  const updates = Array.isArray(body?.updates) ? body.updates : [];
  const rows: Record<string, unknown>[] = [];
  for (const u of updates) {
    if (!ALLOWED.has(u?.metric)) continue;
    const v = Number(u?.target_value);
    if (!Number.isFinite(v) || v < 0) continue;
    const row: Record<string, unknown> = {
      metric: u.metric,
      target_value: v,
      updated_at: new Date().toISOString(),
    };
    if (u.direction === "up" || u.direction === "down") row.direction = u.direction;
    rows.push(row);
  }

  if (rows.length === 0) return json({ error: "no valid updates" }, 400);

  try {
    const client = getServiceClient();
    // onConflict metric → updates only the provided columns; direction/period/active are preserved
    // for existing rows when not supplied.
    const { error } = await client.from("goals").upsert(rows, { onConflict: "metric" });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error("update-goals error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }

  return json({ ok: true, updated: rows.length }, 200);
});

// Strava Webhook Events API receiver.
//
//   GET  → subscription validation handshake. Strava sends hub.mode/hub.challenge/hub.verify_token;
//          we echo { "hub.challenge": <challenge> } when the verify token matches.
//   POST → an event { object_type, object_id, aspect_type, owner_id, ... }. For activity
//          create/update we fetch the full activity and upsert it. We respond 200 immediately
//          on anything unexpected so Strava never disables the subscription.
//
// Deploy with verify_jwt = false (Strava sends no JWT).

import { getServiceClient } from "../_shared/supabase.ts";
import { fetchActivity, stravaActivityToRow, upsertActivities } from "../_shared/strava.ts";
import { json, handlePreflight } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  const url = new URL(req.url);

  // --- Subscription validation handshake ---
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = url.searchParams.get("hub.verify_token");
    const expected = Deno.env.get("STRAVA_VERIFY_TOKEN");

    if (mode === "subscribe" && challenge && verifyToken === expected) {
      return json({ "hub.challenge": challenge }, 200);
    }
    return json({ error: "verify token mismatch" }, 403);
  }

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // --- Event ---
  let event: any = null;
  try {
    event = await req.json();
  } catch (_) {
    return json({ error: "invalid json" }, 400);
  }

  // Acknowledge and process only activity create/update events. Anything else is a no-op 200.
  const isActivity = event?.object_type === "activity";
  const isRelevant = event?.aspect_type === "create" || event?.aspect_type === "update";

  if (isActivity && isRelevant && event?.object_id) {
    try {
      const client = getServiceClient();
      const activity = await fetchActivity(client, event.object_id);
      await upsertActivities(client, [stravaActivityToRow(activity)]);
    } catch (e) {
      // Log but still return 200: the nightly reconcile job will backfill anything we miss,
      // and returning non-2xx risks Strava disabling the subscription.
      console.error("strava-webhook processing error", e);
    }
  }

  return json({ received: true }, 200);
});

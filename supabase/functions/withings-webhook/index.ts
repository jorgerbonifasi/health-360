// Withings Notification API receiver.
//
// Withings validates the callback during `notify subscribe` by POSTing to it — we must always
// return HTTP 200 or the subscription is rejected. On a real notification it POSTs form-urlencoded
// { userid, startdate, enddate, appli }. For weight (appli=1) we fetch the measures in that
// window via getmeas and upsert them.
//
// Deploy with verify_jwt = false (Withings sends no JWT).

import { getServiceClient } from "../_shared/supabase.ts";
import { getMeasures, measureGroupToRow, upsertWeights } from "../_shared/withings.ts";
import { json, handlePreflight } from "../_shared/cors.ts";

const APPLI_WEIGHT = 1;

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  // Any non-POST (incl. Withings' reachability probe) → 200 so the callback validates.
  if (req.method !== "POST") return json({ received: true }, 200);

  // Withings sends application/x-www-form-urlencoded.
  let params: URLSearchParams;
  try {
    const bodyText = await req.text();
    params = new URLSearchParams(bodyText);
  } catch (_) {
    return json({ received: true }, 200);
  }

  const appli = Number(params.get("appli"));
  const startdate = Number(params.get("startdate"));
  const enddate = Number(params.get("enddate"));

  // Only act on weight notifications. Everything else is acknowledged and ignored.
  if (appli === APPLI_WEIGHT) {
    try {
      const client = getServiceClient();
      // Fall back to the last 24h window if the notification omitted a range.
      const now = Math.floor(Date.now() / 1000);
      const start = Number.isFinite(startdate) && startdate > 0 ? startdate - 60 : now - 86400;
      const end = Number.isFinite(enddate) && enddate > 0 ? enddate + 60 : now;

      const groups = await getMeasures(client, start, end);
      const rows = groups
        .map(measureGroupToRow)
        .filter((r): r is Record<string, unknown> => r !== null);
      await upsertWeights(client, rows);
    } catch (e) {
      // Log but still 200 — the nightly reconcile backfills anything missed here.
      console.error("withings-webhook processing error", e);
    }
  }

  return json({ received: true }, 200);
});

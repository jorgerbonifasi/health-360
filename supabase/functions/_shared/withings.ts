// Withings API helpers: fetch weight measures and upsert them idempotently into `weight_logs`.
import type { SupabaseClient } from "./supabase.ts";
import { getValidAccessToken } from "./tokens.ts";

const WITHINGS_MEASURE = "https://wbsapi.withings.net/measure";

// Withings measure type codes.
const TYPE_WEIGHT = 1; // kg
const TYPE_FAT_RATIO = 6; // %

// A single measure group -> one weight_logs row (or null if the group has no weight measure).
export function measureGroupToRow(grp: any): Record<string, unknown> | null {
  const measures: any[] = grp?.measures ?? [];
  const weight = measures.find((m) => m.type === TYPE_WEIGHT);
  if (!weight) return null;

  const fat = measures.find((m) => m.type === TYPE_FAT_RATIO);
  const toReal = (m: any) => m.value * Math.pow(10, m.unit);

  return {
    external_id: String(grp.grpid),
    source: "withings",
    measured_at: new Date(grp.date * 1000).toISOString(),
    weight_kg: toReal(weight),
    fat_ratio: fat ? toReal(fat) : null,
    raw: grp,
  };
}

// Fetch weight measure groups between two unix-second timestamps.
export async function getMeasures(
  client: SupabaseClient,
  startEpochS: number,
  endEpochS: number,
): Promise<any[]> {
  const token = await getValidAccessToken(client, "withings");
  const res = await fetch(WITHINGS_MEASURE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      action: "getmeas",
      meastypes: `${TYPE_WEIGHT},${TYPE_FAT_RATIO}`,
      category: "1", // real measurements (not goals)
      startdate: String(startEpochS),
      enddate: String(endEpochS),
    }).toString(),
  });
  const payload = await res.json();
  if (payload?.status !== 0) {
    throw new Error(`Withings getmeas error: ${JSON.stringify(payload)}`);
  }
  return payload.body?.measuregrps ?? [];
}

// Subscribe to Withings weight notifications (appli=1) for the given callback URL.
// Idempotent-ish: Withings returns an error for a duplicate subscription, which we treat as OK.
// Returns a human-readable status string.
export async function subscribeNotify(
  accessToken: string,
  callbackUrl: string,
): Promise<string> {
  const res = await fetch("https://wbsapi.withings.net/notify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      action: "subscribe",
      callbackurl: callbackUrl,
      appli: "1", // weight
    }).toString(),
  });
  const payload = await res.json();
  if (payload?.status === 0) return "subscribed";
  // 293/2555 etc. commonly mean "already subscribed" — not a real failure.
  return `notify subscribe returned status ${payload?.status} (${payload?.error ?? "already subscribed?"})`;
}

// Upsert one or more weight rows (idempotent on (source, external_id)).
export async function upsertWeights(
  client: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await client
    .from("weight_logs")
    .upsert(rows, { onConflict: "source,external_id" });
  if (error) throw new Error(`Failed to upsert weights: ${error.message}`);
}

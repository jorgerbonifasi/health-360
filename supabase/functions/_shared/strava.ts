// Strava API helpers: fetch activities and upsert them idempotently into `activities`.
import type { SupabaseClient } from "./supabase.ts";
import { getValidAccessToken } from "./tokens.ts";
import { normalizeActivityType } from "./normalizeActivity.ts";

const STRAVA_API = "https://www.strava.com/api/v3";

// Map a raw Strava activity object to our DB row shape.
// Prefer the newer `sport_type` (more specific, e.g. distinguishes TrailRun) over legacy `type`.
export function stravaActivityToRow(a: any): Record<string, unknown> {
  const rawType: string = a.sport_type ?? a.type ?? "Other";
  return {
    strava_id: a.id,
    source: "strava",
    type: rawType,
    type_group: normalizeActivityType(rawType),
    name: a.name ?? null,
    started_at: a.start_date, // ISO 8601 UTC
    distance_m: a.distance ?? 0,
    moving_time_s: a.moving_time ?? 0,
    elapsed_time_s: a.elapsed_time ?? 0,
    avg_hr: a.average_heartrate ?? null,
    max_hr: a.max_heartrate ?? null,
    elevation_m: a.total_elevation_gain ?? null,
    raw: a,
  };
}

async function stravaGet(client: SupabaseClient, path: string): Promise<any> {
  const token = await getValidAccessToken(client, "strava");
  const res = await fetch(`${STRAVA_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Strava GET ${path} failed (${res.status}): ${body}`);
  }
  return await res.json();
}

// Fetch one full activity by id.
export function fetchActivity(client: SupabaseClient, id: number | string): Promise<any> {
  return stravaGet(client, `/activities/${id}`);
}

// List the athlete's activities started after `afterEpochS` (unix seconds).
export async function listActivitiesAfter(
  client: SupabaseClient,
  afterEpochS: number,
): Promise<any[]> {
  const all: any[] = [];
  // Page through in case of many activities in the window.
  for (let page = 1; page <= 10; page++) {
    const batch = await stravaGet(
      client,
      `/athlete/activities?after=${afterEpochS}&per_page=100&page=${page}`,
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

// Upsert one or more activity rows (idempotent on strava_id).
export async function upsertActivities(
  client: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await client
    .from("activities")
    .upsert(rows, { onConflict: "strava_id" });
  if (error) throw new Error(`Failed to upsert activities: ${error.message}`);
}

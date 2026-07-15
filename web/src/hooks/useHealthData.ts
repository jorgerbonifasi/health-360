import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase.ts";
import type { Activity, DailyScore, DailyStep, Goal, WeightLog } from "../lib/types.ts";

export interface HealthData {
  scores: DailyScore[];
  weights: WeightLog[];
  steps: DailyStep[];
  activities: Activity[];
  goals: Goal[];
}

interface State {
  data: HealthData | null;
  loading: boolean;
  error: string | null;
}

// ~13 months of history so the Month view can show 12 monthly buckets.
const WINDOW_DAYS = 400;

function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}
function daysAgoDate(days: number): string {
  return daysAgoISO(days).slice(0, 10);
}

// Supabase/Postgrest errors are plain objects with a `message` field, not Error instances.
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

// Load everything the dashboard needs in parallel. All time-bucketing happens client-side.
async function fetchAll(): Promise<HealthData> {
  if (import.meta.env.VITE_USE_MOCK === "1") {
    const { buildMockData } = await import("../lib/mockData.ts");
    return buildMockData();
  }

  const [scores, weights, steps, activities, goals] = await Promise.all([
    supabase
      .from("daily_scores")
      .select("date, total, movement_score, exercise_score, weight_score, computed_at")
      .gte("date", daysAgoDate(WINDOW_DAYS))
      .order("date", { ascending: true }),
    supabase
      .from("weight_logs")
      .select("measured_at, weight_kg, fat_ratio")
      .gte("measured_at", daysAgoISO(WINDOW_DAYS))
      .order("measured_at", { ascending: true }),
    supabase
      .from("daily_steps")
      .select("date, steps")
      .gte("date", daysAgoDate(WINDOW_DAYS))
      .order("date", { ascending: true }),
    supabase
      .from("activities")
      .select(
        "strava_id, type, type_group, name, started_at, distance_m, moving_time_s, avg_hr, elevation_m",
      )
      .gte("started_at", daysAgoISO(WINDOW_DAYS))
      .order("started_at", { ascending: false }),
    supabase.from("goals").select("metric, target_value, direction, period"),
  ]);

  const firstError =
    scores.error || weights.error || steps.error || activities.error || goals.error;
  if (firstError) throw firstError;

  return {
    scores: (scores.data ?? []) as DailyScore[],
    weights: (weights.data ?? []) as WeightLog[],
    steps: (steps.data ?? []) as DailyStep[],
    activities: (activities.data ?? []) as Activity[],
    goals: (goals.data ?? []) as Goal[],
  };
}

export function useHealthData(): State & { refetch: () => Promise<void> } {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });

  // On refetch we keep the existing data on screen and just swap it in when the new load lands.
  const load = useCallback(async () => {
    try {
      const data = await fetchAll();
      setState({ data, loading: false, error: null });
    } catch (e) {
      setState((s) => ({ data: s.data, loading: false, error: errorMessage(e) }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, refetch: load };
}

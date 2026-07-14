import { useEffect, useState } from "react";
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

// Single hook that loads everything the dashboard needs in parallel. All time-bucketing
// (weekly/monthly) happens client-side from these raw rows.
export function useHealthData(): State {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;

    // Demo mode: render a realistic dataset without a backend (VITE_USE_MOCK=1).
    if (import.meta.env.VITE_USE_MOCK === "1") {
      import("../lib/mockData.ts").then(({ buildMockData }) => {
        if (!cancelled) setState({ data: buildMockData(), loading: false, error: null });
      });
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
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

        if (cancelled) return;
        setState({
          loading: false,
          error: null,
          data: {
            scores: (scores.data ?? []) as DailyScore[],
            weights: (weights.data ?? []) as WeightLog[],
            steps: (steps.data ?? []) as DailyStep[],
            activities: (activities.data ?? []) as Activity[],
            goals: (goals.data ?? []) as Goal[],
          },
        });
      } catch (e) {
        if (cancelled) return;
        setState({ data: null, loading: false, error: errorMessage(e) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

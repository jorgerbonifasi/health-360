import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.ts";
import type {
  Activity,
  DailyScore,
  DailyStep,
  Goal,
  WeeklyActivityHours,
  WeeklyRunning,
  WeightLog,
} from "../lib/types.ts";

export interface HealthData {
  scores: DailyScore[];
  weights: WeightLog[];
  steps: DailyStep[];
  activities: Activity[];
  goals: Goal[];
  weeklyHours: WeeklyActivityHours[];
  weeklyRunning: WeeklyRunning[];
}

interface State {
  data: HealthData | null;
  loading: boolean;
  error: string | null;
}

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

// Single hook that loads everything the dashboard needs in parallel.
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
        const [scores, weights, steps, activities, goals, weeklyHours, weeklyRunning] =
          await Promise.all([
            supabase
              .from("daily_scores")
              .select("date, total, movement_score, exercise_score, weight_score")
              .gte("date", daysAgoDate(90))
              .order("date", { ascending: true }),
            supabase
              .from("weight_logs")
              .select("measured_at, weight_kg, fat_ratio")
              .gte("measured_at", daysAgoISO(120))
              .order("measured_at", { ascending: true }),
            supabase
              .from("daily_steps")
              .select("date, steps")
              .gte("date", daysAgoDate(60))
              .order("date", { ascending: true }),
            supabase
              .from("activities")
              .select(
                "strava_id, type, type_group, name, started_at, distance_m, moving_time_s, avg_hr, elevation_m",
              )
              .gte("started_at", daysAgoISO(90))
              .order("started_at", { ascending: false }),
            supabase.from("goals").select("metric, target_value, direction, period"),
            supabase
              .from("v_weekly_activity_hours")
              .select("week_start, type_group, hours, activity_count")
              .gte("week_start", daysAgoDate(7 * 12))
              .order("week_start", { ascending: true }),
            supabase
              .from("v_weekly_running")
              .select("week_start, km, moving_time_s, avg_pace_min_km, run_count")
              .gte("week_start", daysAgoDate(7 * 12))
              .order("week_start", { ascending: true }),
          ]);

        const firstError =
          scores.error ||
          weights.error ||
          steps.error ||
          activities.error ||
          goals.error ||
          weeklyHours.error ||
          weeklyRunning.error;
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
            weeklyHours: (weeklyHours.data ?? []) as WeeklyActivityHours[],
            weeklyRunning: (weeklyRunning.data ?? []) as WeeklyRunning[],
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

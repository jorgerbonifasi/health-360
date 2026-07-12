// Row shapes mirroring the database tables/views we read from.

export interface DailyScore {
  date: string; // YYYY-MM-DD
  total: number;
  movement_score: number | null;
  exercise_score: number | null;
  weight_score: number | null;
}

export interface WeightLog {
  measured_at: string; // ISO
  weight_kg: number;
  fat_ratio: number | null;
}

export interface DailyStep {
  date: string; // YYYY-MM-DD
  steps: number;
}

export type ActivityGroup = "Run" | "Ride" | "Hike/Walk" | "Racket sports" | "Other";

export interface Activity {
  strava_id: number;
  type: string;
  type_group: ActivityGroup;
  name: string | null;
  started_at: string; // ISO
  distance_m: number;
  moving_time_s: number;
  avg_hr: number | null;
  elevation_m: number | null;
}

export interface Goal {
  metric: string;
  target_value: number;
  direction: string | null;
  period: string | null;
}

export interface WeeklyActivityHours {
  week_start: string; // YYYY-MM-DD (Monday)
  type_group: ActivityGroup;
  hours: number;
  activity_count: number;
}

export interface WeeklyRunning {
  week_start: string;
  km: number;
  moving_time_s: number;
  avg_pace_min_km: number | null;
  run_count: number;
}

export const ACTIVITY_GROUPS: ActivityGroup[] = [
  "Run",
  "Ride",
  "Hike/Walk",
  "Racket sports",
  "Other",
];

// Consistent color per activity group across the dashboard.
export const GROUP_COLORS: Record<ActivityGroup, string> = {
  Run: "#3b82f6",
  Ride: "#f97316",
  "Hike/Walk": "#10b981",
  "Racket sports": "#a855f7",
  Other: "#64748b",
};

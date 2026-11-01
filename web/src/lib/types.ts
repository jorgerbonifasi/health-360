// Row shapes mirroring the database tables/views we read from.

export interface DailyScore {
  date: string; // YYYY-MM-DD
  total: number;
  movement_score: number | null;
  exercise_score: number | null;
  weight_score: number | null;
  computed_at?: string; // ISO — when the score was last computed
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

// One AI coach plan per day, plus the review of how that day actually went (null until the
// "How did <day> go?" button is pressed). Written by the run-plan / run-review Edge Functions.
export type Adherence =
  | "followed"
  | "harder"
  | "easier"
  | "skipped"
  | "cross_trained"
  | "rest_as_planned"
  | "extra";

export interface RunPlan {
  date: string; // YYYY-MM-DD — the day the plan is FOR
  plan_text: string;
  workout_type: string;
  target_distance_km: number | null;
  target_pace_min_km_low: number | null;
  target_pace_min_km_high: number | null;
  target_hr_low: number | null;
  target_hr_high: number | null;
  feel: string | null;
  generated_at: string; // ISO
  reviewed_at: string | null; // ISO — null means not reviewed yet
  review_text: string | null;
  adherence: Adherence | null;
  actual_distance_km: number | null;
  actual_pace_min_km: number | null;
  actual_avg_hr: number | null;
}

// Short label + tone for the adherence chip on a reviewed plan.
export const ADHERENCE_LABELS: Record<Adherence, { label: string; className: string }> = {
  followed: { label: "Followed", className: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
  harder: { label: "Went harder", className: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  easier: { label: "Went easier", className: "bg-sky-500/15 text-sky-300 ring-sky-500/30" },
  skipped: { label: "Skipped", className: "bg-rose-500/15 text-rose-300 ring-rose-500/30" },
  cross_trained: { label: "Cross-trained", className: "bg-violet-500/15 text-violet-300 ring-violet-500/30" },
  rest_as_planned: { label: "Rested as planned", className: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
  extra: { label: "Trained on a rest day", className: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
};

// Demo dataset for previewing the dashboard without a Supabase backend.
// Enabled by setting VITE_USE_MOCK=1 (see README). Generated deterministically so the charts
// look realistic across ~13 months (so the Month view has data too). Never used when
// VITE_USE_MOCK is unset.
import type { HealthData } from "../hooks/useHealthData.ts";
import type { ActivityGroup, RunPlan } from "./types.ts";

const DAY = 86400000;
const HISTORY_DAYS = 400;

function iso(daysAgo: number, hour = 8): string {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}
function dateKey(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);
}
// Deterministic pseudo-random in [0,1).
function rnd(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function buildMockData(): HealthData {
  // Weight: gentle downward trend from ~80 to ~76 with daily noise.
  const weights = [];
  for (let d = HISTORY_DAYS; d >= 0; d -= 1) {
    if (rnd(d) > 0.6) continue; // not every day
    const base = 76 + (d / HISTORY_DAYS) * 4;
    weights.push({
      measured_at: iso(d, 7),
      weight_kg: Math.round((base + (rnd(d + 100) - 0.5) * 0.8) * 10) / 10,
      fat_ratio: Math.round((22 + (rnd(d + 5) - 0.5) * 2) * 10) / 10,
    });
  }

  // Steps: mostly around goal.
  const steps = [];
  for (let d = HISTORY_DAYS; d >= 0; d -= 1) {
    steps.push({ date: dateKey(d), steps: Math.round(6000 + rnd(d + 3) * 8000) });
  }

  // Activities: mixed sports.
  const groups: ActivityGroup[] = ["Run", "Ride", "Hike/Walk", "Racket sports"];
  const activities = [];
  let id = 1000;
  for (let d = HISTORY_DAYS; d >= 0; d -= 1) {
    if (rnd(d + 50) > 0.45) continue; // ~ every other day
    const g = groups[Math.floor(rnd(d + 7) * groups.length)];
    const dur = 1800 + Math.round(rnd(d + 9) * 3600);
    const distance =
      g === "Run" ? 5000 + rnd(d + 11) * 12000
      : g === "Ride" ? 15000 + rnd(d + 13) * 40000
      : g === "Hike/Walk" ? 4000 + rnd(d + 17) * 8000
      : 0;
    activities.push({
      strava_id: id++,
      type: g === "Racket sports" ? "Workout" : g,
      type_group: g,
      name: `${g} session`,
      started_at: iso(d, 18),
      distance_m: Math.round(distance),
      moving_time_s: dur,
      avg_hr: 120 + Math.round(rnd(d + 19) * 40),
      elevation_m: g === "Ride" || g === "Hike/Walk" ? Math.round(rnd(d + 21) * 400) : null,
    });
  }

  // Daily scores.
  const scores = [];
  for (let d = HISTORY_DAYS; d >= 0; d -= 1) {
    const movement = Math.round(60 + rnd(d + 31) * 50);
    const exercise = Math.round(55 + rnd(d + 37) * 55);
    const weight = [40, 70, 100][Math.floor(rnd(d + 41) * 3)];
    const total = Math.round(movement * 0.4 + exercise * 0.4 + weight * 0.2);
    scores.push({
      date: dateKey(d),
      total,
      movement_score: movement,
      exercise_score: exercise,
      weight_score: weight,
    });
  }

  const goals = [
    { metric: "target_weight", target_value: 75, direction: "down", period: "day" },
    { metric: "daily_step_goal", target_value: 10000, direction: null, period: "day" },
    { metric: "weekly_active_hours_goal", target_value: 5, direction: "up", period: "week" },
    { metric: "weekly_running_km_goal", target_value: 40, direction: "up", period: "week" },
  ];

  // Three coach plans: today's fresh, yesterday's awaiting a verdict, and the day before
  // already reviewed — i.e. exactly the state just before you press the review button.
  const runPlans: RunPlan[] = [
    {
      date: dateKey(0),
      plan_text: [
        "Workout: easy",
        "Distance: 8 km",
        "Target pace: 5:40-5:55/km",
        "Target HR: 138-150 bpm",
        "Why: You have run three days in a row, so keep today conversational and let the legs come back.",
        "Reminder: Start slower than feels right for the first kilometre.",
      ].join("\n"),
      workout_type: "easy",
      target_distance_km: 8,
      target_pace_min_km_low: 5.67,
      target_pace_min_km_high: 5.92,
      target_hr_low: 138,
      target_hr_high: 150,
      feel: null,
      generated_at: iso(0, 7),
      reviewed_at: null,
      review_text: null,
      adherence: null,
      actual_distance_km: null,
      actual_pace_min_km: null,
      actual_avg_hr: null,
    },
    {
      date: dateKey(1),
      plan_text: [
        "Workout: tempo",
        "Distance: 6 km",
        "Target pace: 4:55-5:05/km",
        "Target HR: 158-168 bpm",
        "Why: You have had two easy days, so this is the week's quality session.",
        "Reminder: Two kilometres of warm-up before you touch tempo pace.",
      ].join("\n"),
      workout_type: "tempo",
      target_distance_km: 6,
      target_pace_min_km_low: 4.92,
      target_pace_min_km_high: 5.08,
      target_hr_low: 158,
      target_hr_high: 168,
      feel: null,
      generated_at: iso(1, 7),
      reviewed_at: null,
      review_text: null,
      adherence: null,
      actual_distance_km: null,
      actual_pace_min_km: null,
      actual_avg_hr: null,
    },
    {
      date: dateKey(2),
      plan_text: [
        "Workout: easy",
        "Distance: 7 km",
        "Target pace: 5:45-6:00/km",
        "Target HR: 135-148 bpm",
        "Why: Second run of the week off a hard weekend - keep it genuinely easy.",
        "Reminder: Breathe through your nose if you can.",
      ].join("\n"),
      workout_type: "easy",
      target_distance_km: 7,
      target_pace_min_km_low: 5.75,
      target_pace_min_km_high: 6,
      target_hr_low: 135,
      target_hr_high: 148,
      feel: "legs a bit heavy",
      generated_at: iso(2, 7),
      reviewed_at: iso(2, 20),
      review_text:
        "You were asked for 7 km easy at 5:45-6:00/km and ran 9.2 km at 5:12/km with an average " +
        "heart rate of 162 - that is a tempo effort wearing an easy run's clothes. It felt good, " +
        "but easy days exist to make the hard days possible. Next time hold the first kilometre " +
        "back and let the pace settle rather than chasing it.",
      adherence: "harder",
      actual_distance_km: 9.2,
      actual_pace_min_km: 5.2,
      actual_avg_hr: 162,
    },
  ];

  return { scores, weights, steps, activities, goals, runPlans };
}

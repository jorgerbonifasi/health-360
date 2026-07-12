// Pure Health 360 scoring logic (no I/O — easy to reason about and test).
//
// Three pillars, each 0..~120 before weighting:
//   movement  = min(steps / daily_step_goal, cap) × 100
//   exercise  = min(rolling-7d active hours / weekly_active_hours_goal, cap) × 100
//   weight    = trend of the 7-day rolling average vs the goal direction:
//                 toward goal → 100, flat (±0.1 kg/wk) → 70, away → 40
//
// Missing-data rule: a pillar with no data is DROPPED (not zeroed); the remaining pillar weights
// are renormalized so they sum to 1. Notes:
//   - movement is "missing" when there is no steps row for the day (a failed export, not a real 0).
//   - exercise is always present: 0 hours over the trailing week is a genuine signal, not a gap.
//   - weight is "missing" when there was no weigh-in in the trailing 7 days.

export type Direction = "down" | "up";

export interface ScoreGoals {
  dailyStepGoal: number;
  weeklyActiveHoursGoal: number;
  weightDirection: Direction; // direction we want the weight trend to move
  cap: number; // e.g. 1.2
  weights: { movement: number; exercise: number; weight: number };
}

export interface ScoreInputs {
  steps: number | null; // null = no steps row for the day
  weeklyActiveHours: number; // trailing-7d sum of moving time, in hours
  weightRecentAvg: number | null; // 7-day rolling avg ending on the day; null = no recent weigh-in
  weightPriorAvg: number | null; // 7-day rolling avg ending 7 days earlier; null = insufficient history
}

export interface ScoreResult {
  total: number;
  movement: number | null;
  exercise: number | null;
  weight: number | null;
  effectiveWeights: { movement: number; exercise: number; weight: number };
  details: Record<string, unknown>;
}

const FLAT_THRESHOLD_KG = 0.1; // per-week band considered "flat"

function movementScore(steps: number, goal: number, cap: number): number {
  if (goal <= 0) return 0;
  return Math.min(steps / goal, cap) * 100;
}

function exerciseScore(hours: number, goalHours: number, cap: number): number {
  if (goalHours <= 0) return 0;
  return Math.min(hours / goalHours, cap) * 100;
}

// Trend of the rolling average. slope = recent - prior (kg over one week).
function weightTrendScore(
  recentAvg: number,
  priorAvg: number,
  direction: Direction,
): number {
  const slope = recentAvg - priorAvg;
  if (Math.abs(slope) <= FLAT_THRESHOLD_KG) return 70; // flat
  const movingDown = slope < 0;
  const towardGoal = direction === "down" ? movingDown : !movingDown;
  return towardGoal ? 100 : 40;
}

export function computeDailyScore(inputs: ScoreInputs, goals: ScoreGoals): ScoreResult {
  const details: Record<string, unknown> = { inputs };

  // --- Movement ---
  let movement: number | null = null;
  if (inputs.steps !== null) {
    movement = movementScore(inputs.steps, goals.dailyStepGoal, goals.cap);
  }

  // --- Exercise (always present) ---
  const exercise = exerciseScore(
    inputs.weeklyActiveHours,
    goals.weeklyActiveHoursGoal,
    goals.cap,
  );

  // --- Weight trend ---
  let weight: number | null = null;
  if (inputs.weightRecentAvg !== null) {
    if (inputs.weightPriorAvg !== null) {
      weight = weightTrendScore(
        inputs.weightRecentAvg,
        inputs.weightPriorAvg,
        goals.weightDirection,
      );
    } else {
      // We have a current reading but no prior week to compare against → neutral, not punished.
      weight = 70;
    }
  }

  // --- Weighted total over present pillars, with renormalized weights ---
  const present: Array<[number, number]> = []; // [score, configuredWeight]
  const eff = { movement: 0, exercise: 0, weight: 0 };
  if (movement !== null) present.push([movement, goals.weights.movement]);
  present.push([exercise, goals.weights.exercise]);
  if (weight !== null) present.push([weight, goals.weights.weight]);

  const weightSum = present.reduce((acc, [, w]) => acc + w, 0);
  let total = 0;
  if (weightSum > 0) {
    total = present.reduce((acc, [s, w]) => acc + s * (w / weightSum), 0);
    if (movement !== null) eff.movement = goals.weights.movement / weightSum;
    eff.exercise = goals.weights.exercise / weightSum;
    if (weight !== null) eff.weight = goals.weights.weight / weightSum;
  }

  const round1 = (n: number) => Math.round(n * 10) / 10;

  return {
    total: round1(total),
    movement: movement === null ? null : round1(movement),
    exercise: round1(exercise),
    weight,
    effectiveWeights: eff,
    details,
  };
}

// Mean of numbers, or null if empty.
export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

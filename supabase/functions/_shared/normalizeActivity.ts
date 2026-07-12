// Normalize Strava activity types into the display groups used across the dashboard.
//
// Strava logs tennis inconsistently: as a generic "Workout" or as "TennisSport"/"Tennis"
// depending on how it was recorded — both map to "Racket sports".
//
// Distance-based metrics (km, pace) only make sense for Run / Ride / Hike/Walk; duration and
// HR are the universal metrics for every group.

export type ActivityGroup =
  | "Run"
  | "Ride"
  | "Hike/Walk"
  | "Racket sports"
  | "Other";

const GROUP_MAP: Record<string, ActivityGroup> = {
  Run: "Run",
  TrailRun: "Run",
  VirtualRun: "Run",
  Ride: "Ride",
  VirtualRide: "Ride",
  EBikeRide: "Ride",
  MountainBikeRide: "Ride",
  GravelRide: "Ride",
  Hike: "Hike/Walk",
  Walk: "Hike/Walk",
  Tennis: "Racket sports",
  TennisSport: "Racket sports",
  Workout: "Racket sports", // tennis is often logged as a generic Workout
  Squash: "Racket sports",
  Badminton: "Racket sports",
  Pickleball: "Racket sports",
};

export function normalizeActivityType(stravaType: string | undefined | null): ActivityGroup {
  if (!stravaType) return "Other";
  return GROUP_MAP[stravaType] ?? "Other";
}

// Groups where distance/pace is the primary, meaningful metric.
export function isDistanceSport(group: ActivityGroup): boolean {
  return group === "Run" || group === "Ride" || group === "Hike/Walk";
}

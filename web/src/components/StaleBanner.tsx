import type { DailyStep, WeightLog } from "../lib/types.ts";

const DAY_MS = 86400000;

// Flags a source that has gone quiet, so a silent failure (a dead phone automation, an expired
// token) shows up within days instead of surfacing weeks later as a pillar that quietly drops
// out of the score. Only sources with a regular cadence are checked: steps arrive daily, but a
// gap in Strava activities is usually just a rest day, so it isn't flagged.
const STEPS_STALE_DAYS = 2;
const WEIGHT_STALE_DAYS = 14;

function daysSince(iso: string): number {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - d.getTime()) / DAY_MS);
}

export function StaleBanner({ steps, weights }: { steps: DailyStep[]; weights: WeightLog[] }) {
  const alerts: string[] = [];

  const lastSteps = steps[steps.length - 1]?.date;
  if (lastSteps && daysSince(lastSteps) >= STEPS_STALE_DAYS) {
    alerts.push(
      `No steps for ${daysSince(lastSteps)} days — check the Health Auto Export automation on your iPhone. The Movement score is excluded until it syncs.`,
    );
  }

  const lastWeigh = weights[weights.length - 1]?.measured_at;
  if (lastWeigh && daysSince(lastWeigh) >= WEIGHT_STALE_DAYS) {
    alerts.push(`No weigh-in for ${daysSince(lastWeigh)} days — the Weight score is excluded until the next one.`);
  }

  if (alerts.length === 0) return null;

  return (
    <div
      role="alert"
      className="mb-4 space-y-1 rounded-xl bg-amber-950/40 p-3 text-xs text-amber-200 ring-1 ring-amber-500/30"
    >
      {alerts.map((a) => (
        <p key={a}>⚠️ {a}</p>
      ))}
    </div>
  );
}

import type { Activity, DailyScore, DailyStep, WeightLog } from "../lib/types.ts";
import { dayLabel, timeAgo } from "../lib/metrics.ts";

// Per-source freshness footer. Uses the latest data point per source ("data through"), which is
// what tells you how current each pillar is (e.g. why the Weight pillar shows "no data").
export function LastSynced({
  activities,
  weights,
  steps,
  scores,
}: {
  activities: Activity[];
  weights: WeightLog[];
  steps: DailyStep[];
  scores: DailyScore[];
}) {
  // activities are ordered newest-first; the others oldest-first.
  const lastActivity = activities[0]?.started_at;
  const lastWeigh = weights[weights.length - 1]?.measured_at;
  const lastStep = steps[steps.length - 1]?.date;
  const lastScore = scores[scores.length - 1]?.computed_at;

  const items = [
    { icon: "🏃", label: "Strava", value: activities.length ? timeAgo(lastActivity) : "—" },
    { icon: "⚖️", label: "Withings", value: weights.length ? timeAgo(lastWeigh) : "—" },
    { icon: "👣", label: "Steps", value: steps.length ? dayLabel(lastStep) : "—" },
    { icon: "🎯", label: "Score", value: scores.length ? timeAgo(lastScore) : "—" },
  ];

  return (
    <footer className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
      <span className="uppercase tracking-wide text-slate-600">Synced</span>
      {items.map((it) => (
        <span key={it.label} className="whitespace-nowrap">
          {it.icon} {it.label} <span className="text-slate-400">{it.value}</span>
        </span>
      ))}
    </footer>
  );
}

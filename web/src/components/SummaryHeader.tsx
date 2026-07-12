import type { Activity, DailyStep, Goal, WeightLog } from "../lib/types.ts";
import { round1, startOfWeek, weightSummary } from "../lib/metrics.ts";

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: { text: string; tone?: "good" | "bad" | "muted" };
}) {
  const toneClass =
    sub?.tone === "good"
      ? "text-emerald-400"
      : sub?.tone === "bad"
        ? "text-rose-400"
        : "text-slate-400";
  return (
    <div className="rounded-xl bg-slate-800/60 p-3 ring-1 ring-white/5">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-100">{value}</div>
      {sub && <div className={`text-xs ${toneClass}`}>{sub.text}</div>}
    </div>
  );
}

export function SummaryHeader({
  weights,
  steps,
  activities,
  goals,
}: {
  weights: WeightLog[];
  steps: DailyStep[];
  activities: Activity[];
  goals: Goal[];
}) {
  const { latest, weeklyDelta } = weightSummary(weights);
  const weightDown = goals.find((g) => g.metric === "target_weight")?.direction !== "up";

  // Yesterday's steps.
  const yKey = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const yesterdaySteps = steps.find((s) => s.date === yKey)?.steps ?? null;

  // This week's totals.
  const weekStart = startOfWeek(new Date()).getTime();
  const thisWeek = activities.filter((a) => new Date(a.started_at).getTime() >= weekStart);
  const activeHours = round1(thisWeek.reduce((s, a) => s + a.moving_time_s, 0) / 3600);
  const runningKm = round1(
    thisWeek
      .filter((a) => a.type_group === "Run")
      .reduce((s, a) => s + a.distance_m, 0) / 1000,
  );

  const deltaTone: "good" | "bad" | "muted" =
    weeklyDelta == null || weeklyDelta === 0
      ? "muted"
      : weightDown === weeklyDelta < 0
        ? "good"
        : "bad";
  const deltaText =
    weeklyDelta == null
      ? "—"
      : `${weeklyDelta > 0 ? "+" : ""}${weeklyDelta} kg / wk`;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat
        label="Weight"
        value={latest != null ? `${latest} kg` : "—"}
        sub={{ text: deltaText, tone: deltaTone }}
      />
      <Stat
        label="Steps (yesterday)"
        value={yesterdaySteps != null ? yesterdaySteps.toLocaleString() : "—"}
      />
      <Stat label="Active (this wk)" value={`${activeHours} h`} />
      <Stat label="Running (this wk)" value={`${runningKm} km`} />
    </div>
  );
}

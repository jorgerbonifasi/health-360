import type { ReactNode } from "react";
import type { Activity, DailyStep, Goal, WeightLog } from "../lib/types.ts";
import {
  average,
  goalDirection,
  pctDelta,
  round1,
  trailingBounds,
  weightSummary,
  type Period,
} from "../lib/metrics.ts";
import { Delta } from "./Delta.tsx";

function Stat({ label, value, delta }: { label: string; value: string; delta?: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-800/60 p-3 ring-1 ring-white/5">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-100">{value}</div>
      {delta && <div className="mt-0.5">{delta}</div>}
    </div>
  );
}

// Summary stats over the current trailing window (7d for Week, 30d for Month), each with a
// ▲/▼ delta vs the previous window.
export function SummaryHeader({
  weights,
  steps,
  activities,
  goals,
  period,
}: {
  weights: WeightLog[];
  steps: DailyStep[];
  activities: Activity[];
  goals: Goal[];
  period: Period;
}) {
  const win = period === "week" ? "7d" : "30d";
  const within = (t: number, offset: number) => {
    const { start, end } = trailingBounds(period, offset);
    return t >= start && t < end;
  };

  // Weight — headline is the latest reading; delta is the trailing-avg change (kg).
  const latest = weightSummary(weights).latest;
  const weightAvg = (offset: number) =>
    average(weights.filter((w) => within(new Date(w.measured_at).getTime(), offset)).map((w) => w.weight_kg));
  const wCur = weightAvg(0);
  const wPrev = weightAvg(-1);
  const wDelta = wCur != null && wPrev != null ? round1(wCur - wPrev) : null;
  const weightGood = goalDirection(goals, "target_weight") === "up" ? "up" : "down";

  // Steps — sum over the window.
  const stepSum = (offset: number) =>
    steps.filter((s) => within(new Date(s.date + "T00:00:00").getTime(), offset)).reduce((a, s) => a + s.steps, 0);
  const stepCur = stepSum(0);

  // Active hours (all sports).
  const activeHours = (offset: number) =>
    activities.filter((a) => within(new Date(a.started_at).getTime(), offset)).reduce((a, x) => a + x.moving_time_s, 0) /
    3600;
  const acCur = activeHours(0);

  // Running km.
  const runKm = (offset: number) =>
    activities
      .filter((a) => a.type_group === "Run" && within(new Date(a.started_at).getTime(), offset))
      .reduce((a, x) => a + x.distance_m, 0) / 1000;
  const rCur = runKm(0);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat
        label="Weight"
        value={latest != null ? `${latest} kg` : "—"}
        delta={<Delta value={wDelta} unit="kg" goodWhen={weightGood} />}
      />
      <Stat
        label={`Steps · ${win}`}
        value={stepCur.toLocaleString()}
        delta={<Delta value={pctDelta(stepCur, stepSum(-1))} unit="%" goodWhen="up" />}
      />
      <Stat
        label={`Active · ${win}`}
        value={`${round1(acCur)} h`}
        delta={<Delta value={pctDelta(acCur, activeHours(-1))} unit="%" goodWhen="up" />}
      />
      <Stat
        label={`Running · ${win}`}
        value={`${round1(rCur)} km`}
        delta={<Delta value={pctDelta(rCur, runKm(-1))} unit="%" goodWhen="up" />}
      />
    </div>
  );
}

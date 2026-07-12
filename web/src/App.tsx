import { useState } from "react";
import { useHealthData } from "./hooks/useHealthData.ts";
import type { Period } from "./lib/metrics.ts";
import { PeriodToggle } from "./components/PeriodToggle.tsx";
import { ScoreGauge } from "./components/ScoreGauge.tsx";
import { SummaryHeader } from "./components/SummaryHeader.tsx";
import { WeightChart } from "./components/WeightChart.tsx";
import { StepsChart } from "./components/StepsChart.tsx";
import { ActivityMixChart } from "./components/ActivityMixChart.tsx";
import { RunningPanel } from "./components/RunningPanel.tsx";
import { ActivityLog } from "./components/ActivityLog.tsx";

export default function App() {
  const { data, loading, error } = useHealthData();
  const [period, setPeriod] = useState<Period>("week");

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl px-4 pb-16 pt-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Health 360</h1>
          <span className="text-xs text-slate-500">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </span>
        </div>
        <PeriodToggle period={period} onChange={setPeriod} />
      </header>

      {loading && <Skeleton />}

      {error && (
        <div className="rounded-xl bg-rose-950/50 p-4 text-sm text-rose-300 ring-1 ring-rose-500/30">
          <p className="font-semibold">Couldn't load data</p>
          <p className="mt-1 text-rose-400/80">{error}</p>
          <p className="mt-2 text-xs text-rose-400/60">
            Check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in web/.env.local and that the
            migration + RLS policies are applied.
          </p>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <ScoreGauge scores={data.scores} period={period} />
          <SummaryHeader
            weights={data.weights}
            steps={data.steps}
            activities={data.activities}
            goals={data.goals}
            period={period}
          />
          <WeightChart weights={data.weights} goals={data.goals} period={period} />
          <StepsChart steps={data.steps} goals={data.goals} period={period} />
          <ActivityMixChart activities={data.activities} period={period} />
          <RunningPanel activities={data.activities} goals={data.goals} period={period} />
          <ActivityLog activities={data.activities} />
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-800/60" />
      ))}
    </div>
  );
}

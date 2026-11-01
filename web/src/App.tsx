import { useState } from "react";
import { useHealthData } from "./hooks/useHealthData.ts";
import { anchorDate, maxBack, periodLabel, type Period } from "./lib/metrics.ts";
import { PeriodToggle } from "./components/PeriodToggle.tsx";
import { RefreshButton } from "./components/RefreshButton.tsx";
import { SettingsPanel } from "./components/SettingsPanel.tsx";
import { ScoreGauge } from "./components/ScoreGauge.tsx";
import { SummaryHeader } from "./components/SummaryHeader.tsx";
import { WeightChart } from "./components/WeightChart.tsx";
import { StepsChart } from "./components/StepsChart.tsx";
import { ActivityMixChart } from "./components/ActivityMixChart.tsx";
import { RunningPanel } from "./components/RunningPanel.tsx";
import { RunPlanCard } from "./components/RunPlanCard.tsx";
import { ActivityLog } from "./components/ActivityLog.tsx";
import { LastSynced } from "./components/LastSynced.tsx";

export default function App() {
  const { data, loading, error, refetch } = useHealthData();
  const [period, setPeriod] = useState<Period>("week");
  const [back, setBack] = useState(0); // periods back from now (0 = current)
  const [showSettings, setShowSettings] = useState(false);

  // Switching Day/Week/Month resets to the current period.
  const changePeriod = (p: Period) => {
    setPeriod(p);
    setBack(0);
  };
  const anchor = anchorDate(period, back);

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl px-4 pb-16 pt-6">
      <header className="mb-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-slate-100">Health 360</h1>
            <span className="text-xs text-slate-500">
              {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <RefreshButton onRefreshed={refetch} />
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              title="Goals & scoring"
              aria-label="Settings"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-base text-slate-300 ring-1 ring-white/10 transition hover:text-white"
            >
              ⚙️
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PeriodToggle period={period} onChange={changePeriod} />
          <nav className="flex items-center gap-1.5 text-xs text-slate-400">
            <button
              type="button"
              onClick={() => setBack((b) => Math.min(maxBack(period), b + 1))}
              disabled={back >= maxBack(period)}
              aria-label="Previous period"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-800 ring-1 ring-white/10 transition hover:text-white disabled:opacity-40"
            >
              ‹
            </button>
            <span className="min-w-[7.5rem] text-center tabular-nums text-slate-300">
              {periodLabel(period, back)}
            </span>
            <button
              type="button"
              onClick={() => setBack((b) => Math.max(0, b - 1))}
              disabled={back === 0}
              aria-label="Next period"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-800 ring-1 ring-white/10 transition hover:text-white disabled:opacity-40"
            >
              ›
            </button>
          </nav>
        </div>
      </header>

      {showSettings && data && (
        <SettingsPanel goals={data.goals} onClose={() => setShowSettings(false)} onSaved={refetch} />
      )}

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
          <ScoreGauge scores={data.scores} goals={data.goals} period={period} anchor={anchor} />
          <SummaryHeader
            weights={data.weights}
            steps={data.steps}
            activities={data.activities}
            goals={data.goals}
            period={period}
            anchor={anchor}
          />
          <WeightChart weights={data.weights} goals={data.goals} period={period} anchor={anchor} />
          <StepsChart steps={data.steps} goals={data.goals} period={period} anchor={anchor} />
          <ActivityMixChart activities={data.activities} period={period} anchor={anchor} />
          <RunningPanel activities={data.activities} goals={data.goals} period={period} anchor={anchor} />
          <RunPlanCard plans={data.runPlans} onChanged={refetch} />
          <ActivityLog activities={data.activities} />
          <LastSynced
            activities={data.activities}
            weights={data.weights}
            steps={data.steps}
            scores={data.scores}
          />
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

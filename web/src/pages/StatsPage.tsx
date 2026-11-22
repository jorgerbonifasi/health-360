import { useState } from "react";
import type { HealthData } from "../hooks/useHealthData.ts";
import { anchorDate, maxBack, periodLabel, type Period } from "../lib/metrics.ts";
import { PeriodToggle } from "../components/PeriodToggle.tsx";
import { ScoreGauge } from "../components/ScoreGauge.tsx";
import { SummaryHeader } from "../components/SummaryHeader.tsx";
import { WeightChart } from "../components/WeightChart.tsx";
import { StepsChart } from "../components/StepsChart.tsx";
import { ActivityMixChart } from "../components/ActivityMixChart.tsx";
import { RunningPanel } from "../components/RunningPanel.tsx";
import { ActivityLog } from "../components/ActivityLog.tsx";

type Section = "overview" | "runs" | "body" | "load";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "runs", label: "Runs" },
  { id: "body", label: "Body" },
  { id: "load", label: "Load" },
];

// Segmented sections like openGym's Stats. The existing charts are re-homed, not rebuilt; the
// Day/Week/Month toggle and the < > time-machine live here because the charts below use them.
export function StatsPage({ data }: { data: HealthData }) {
  const [section, setSection] = useState<Section>("overview");
  const [period, setPeriod] = useState<Period>("week");
  const [back, setBack] = useState(0);
  const anchor = anchorDate(period, back);

  return (
    <div className="space-y-4">
      <div className="flex rounded-xl bg-surface p-1 ring-1 ring-white/5" role="tablist">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            onClick={() => setSection(s.id)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              section === s.id ? "bg-raised text-slate-100" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <PeriodToggle
          period={period}
          onChange={(p) => {
            setPeriod(p);
            setBack(0);
          }}
        />
        <nav className="flex items-center gap-1.5 text-xs text-slate-400">
          <button
            type="button"
            onClick={() => setBack((b) => Math.min(maxBack(period), b + 1))}
            disabled={back >= maxBack(period)}
            aria-label="Previous period"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-surface ring-1 ring-white/10 transition hover:text-white disabled:opacity-40"
          >
            ‹
          </button>
          <span className="min-w-[7.5rem] text-center tabular-nums text-slate-300">{periodLabel(period, back)}</span>
          <button
            type="button"
            onClick={() => setBack((b) => Math.max(0, b - 1))}
            disabled={back === 0}
            aria-label="Next period"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-surface ring-1 ring-white/10 transition hover:text-white disabled:opacity-40"
          >
            ›
          </button>
        </nav>
      </div>

      {section === "overview" && (
        <>
          <ScoreGauge scores={data.scores} goals={data.goals} period={period} anchor={anchor} />
          <SummaryHeader
            weights={data.weights}
            steps={data.steps}
            activities={data.activities}
            goals={data.goals}
            period={period}
            anchor={anchor}
          />
        </>
      )}
      {section === "runs" && (
        <>
          <RunningPanel activities={data.activities} goals={data.goals} period={period} anchor={anchor} />
          <ActivityLog activities={data.activities} />
        </>
      )}
      {section === "body" && (
        <WeightChart weights={data.weights} goals={data.goals} period={period} anchor={anchor} />
      )}
      {section === "load" && (
        <>
          <StepsChart steps={data.steps} goals={data.goals} period={period} anchor={anchor} />
          <ActivityMixChart activities={data.activities} period={period} anchor={anchor} />
        </>
      )}
    </div>
  );
}

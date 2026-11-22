import { useEffect, useRef, useState } from "react";
import type { Activity } from "../lib/types.ts";
import { heatLevel, heatmap, type HeatMetric } from "../lib/stats.ts";

// Fixed-size cells keep the grid legible on a phone; it scrolls sideways with the newest weeks in view.
const CELL = 11;
const GAP = 3;
const LEVEL_CLASS = ["bg-raised", "bg-lime-900", "bg-lime-700", "bg-lime-500", "bg-accent"];

// GitHub-style 12-month grid of running, switchable between time and distance.
export function ActivityHeatmap({ activities }: { activities: Activity[] }) {
  const [metric, setMetric] = useState<HeatMetric>("time");
  const { weeks, max } = heatmap(activities, metric);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  // A month label above the first column of each new month.
  const labels = weeks.map((col, i) => {
    const d = new Date(`${col[0].date}T12:00:00`);
    const prev = i > 0 ? new Date(`${weeks[i - 1][0].date}T12:00:00`) : null;
    return !prev || prev.getMonth() !== d.getMonth() ? d.toLocaleDateString(undefined, { month: "short" }) : "";
  });

  const unit = metric === "time" ? "min" : "km";

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-white/5">
      <p className="text-sm text-slate-400">Activity (last 12 months)</p>
      <div className="mt-3 flex rounded-lg bg-raised p-0.5" role="tablist">
        {(["time", "distance"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={metric === m}
            onClick={() => setMetric(m)}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium capitalize transition ${
              metric === m ? "bg-surface text-slate-100" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <div className="shrink-0 pt-5 text-[10px] leading-none text-slate-500">
          {["Mon", "", "Wed", "", "Fri", "", ""].map((d, i) => (
            <div key={i} style={{ height: CELL, marginBottom: GAP }} className="flex items-center">
              {d}
            </div>
          ))}
        </div>
        <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto pb-1">
          <div style={{ width: weeks.length * (CELL + GAP) }}>
            <div className="relative h-5 text-[10px] text-slate-500">
              {labels.map((l, i) =>
                l ? (
                  <span key={i} className="absolute" style={{ left: i * (CELL + GAP) }}>
                    {l}
                  </span>
                ) : null,
              )}
            </div>
            <div className="flex" style={{ gap: GAP }}>
              {weeks.map((col) => (
                <div key={col[0].date} className="flex flex-col" style={{ gap: GAP }}>
                  {col.map((c) => (
                    <span
                      key={c.date}
                      title={`${c.date}${c.value > 0 ? ` · ${Math.round(c.value * 10) / 10} ${unit}` : ""}`}
                      style={{ width: CELL, height: CELL }}
                      className={`rounded-[3px] ${c.future ? "bg-transparent" : LEVEL_CLASS[heatLevel(c.value, max)]}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-slate-500">
        <span>Less {metric}</span>
        {LEVEL_CLASS.slice(1).map((c) => (
          <span key={c} className={`h-2.5 w-2.5 rounded-[2px] ${c}`} />
        ))}
        <span>More {metric}</span>
      </div>
    </section>
  );
}

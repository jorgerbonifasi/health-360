import type { Activity } from "../lib/types.ts";
import { formatDuration } from "../lib/metrics.ts";
import { distanceComparison, runTotals } from "../lib/stats.ts";

export function RunTotalCard({ activities }: { activities: Activity[] }) {
  const t = runTotals(activities);
  const compare = distanceComparison(t.km);
  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-white/5">
      <p className="text-xs text-slate-400">Run in total</p>
      <p className="mt-1 text-4xl font-bold text-slate-100">
        {Math.round(t.km).toLocaleString()} <span className="text-2xl font-semibold">km</span>
      </p>
      <p className="mt-1 text-sm text-slate-400">
        {t.count} runs · {formatDuration(t.seconds)}
      </p>
      {compare && <p className="mt-1 text-sm italic text-slate-500">{compare}</p>}
    </section>
  );
}

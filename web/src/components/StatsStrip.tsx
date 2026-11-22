import type { Activity, Goal, WeightLog } from "../lib/types.ts";
import { round1, toDisplayWeight, WEIGHT_UNIT } from "../lib/metrics.ts";
import { runsThisMonth, runTotals, weightStats } from "../lib/stats.ts";

// openGym's 3-up strip: Runs / This month / Weight 30d.
export function StatsStrip({ activities, weights, goals }: { activities: Activity[]; weights: WeightLog[]; goals: Goal[] }) {
  const totals = runTotals(activities);
  const month = runsThisMonth(activities);
  const st = weightStats(weights, goals);
  const change = st.change30Kg != null ? round1(toDisplayWeight(st.change30Kg)) : null;
  const toward =
    change != null && st.goalKg != null && st.latestKg != null
      ? Math.abs(st.latestKg - st.change30Kg! - st.goalKg) > Math.abs(st.latestKg - st.goalKg)
      : null;

  const cells: { label: string; value: string; accent?: boolean }[] = [
    { label: "Runs", value: String(totals.count) },
    { label: "This month", value: String(month) },
    {
      label: `Weight 30d`,
      value: change == null ? "—" : `${change > 0 ? "+" : ""}${change} ${WEIGHT_UNIT}`,
      accent: toward === true,
    },
  ];

  return (
    <section className="grid grid-cols-3 divide-x divide-white/10 rounded-2xl bg-surface ring-1 ring-white/5">
      {cells.map((c) => (
        <div key={c.label} className="p-4">
          <p className="text-xs text-slate-400">{c.label}</p>
          <p className={`mt-1 text-2xl font-bold ${c.accent ? "text-accent" : "text-slate-100"}`}>{c.value}</p>
        </div>
      ))}
    </section>
  );
}

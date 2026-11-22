import type { Activity, Goal } from "../lib/types.ts";
import { monthChallenges } from "../lib/challenges.ts";
import { useStored } from "../lib/useStored.ts";

// "This month's challenges": three targets scaled from your own last three months, with progress
// bars. Collapsible; the collapsed state is remembered per month.
export function ChallengesCard({ activities, goals }: { activities: Activity[]; goals: Goal[] }) {
  const mc = monthChallenges(activities, goals);
  const monthKey = new Date().toISOString().slice(0, 7);
  const [collapsed, setCollapsed] = useStored<boolean>(`h360.challenges.collapsed.${monthKey}`, false);

  const justDone = mc.items.filter((i) => i.done);

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-white/5">
      <button type="button" onClick={() => setCollapsed(!collapsed)} className="flex w-full items-center gap-3 text-left" aria-expanded={!collapsed}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-exercise text-lg text-black" aria-hidden="true">◎</span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-slate-400">
            {mc.label} · {mc.doneCount} of {mc.items.length} done
          </span>
          <span className="block text-lg font-semibold text-slate-100">This month's challenges</span>
        </span>
        <span className="text-slate-500">{collapsed ? "⌄" : "⌃"}</span>
      </button>

      {!collapsed && (
        <ul className="mt-4 space-y-4">
          {mc.items.map((c) => {
            const pct = Math.min(100, (c.progress / c.target) * 100);
            const value = c.unit ? `${c.progress} / ${c.target} ${c.unit}` : `${c.progress} / ${c.target}`;
            return (
              <li key={c.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-base text-slate-100">{c.title}</span>
                  <span className={`shrink-0 text-sm tabular-nums ${c.done ? "text-accent" : "text-slate-400"}`}>
                    {c.done ? "✓ " : ""}
                    {value}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-raised">
                  <div className={`h-full rounded-full ${c.done ? "bg-accent" : "bg-exercise"}`} style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
          {justDone.length > 0 && (
            <li className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200">
              Challenge done: {justDone[justDone.length - 1].title.replace(" this month", "")}. Nice work.
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

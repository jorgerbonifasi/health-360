import type { Activity } from "../lib/types.ts";
import { BADGES, FREEZE_EVERY, MAX_FREEZES, MIN_RUNS_PER_WEEK, streakInfo } from "../lib/stats.ts";

const runWord = (n: number) => (n === 1 ? "run" : "runs");

const MEDAL: Record<number, string> = {
  4: "text-amber-600",
  12: "text-slate-300",
  26: "text-amber-300",
  52: "text-cyan-300",
  104: "text-fuchsia-300",
};

// Week streak with freezes. Compact = the Home version (headline + one line); full adds the badge
// row, progress to the next badge and an explainer, like openGym's Stats overview.
export function StreakCard({ activities, compact = false }: { activities: Activity[]; compact?: boolean }) {
  const s = streakInfo(activities);

  const freezeChips = Array.from({ length: MAX_FREEZES }, (_, i) => (
    <span
      key={i}
      title={i < s.freezes ? "Freeze ready" : "Freeze not earned yet"}
      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
        i < s.freezes ? "bg-sky-500/20 text-sky-300" : "bg-raised text-slate-600"
      }`}
    >
      ❄
    </span>
  ));

  if (compact) {
    return (
      <section className="flex items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-white/5">
        <span className="text-2xl" aria-hidden="true">🔥</span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-slate-100">{s.current} week streak</p>
          <p className="text-sm text-slate-400">
            {Math.min(s.thisWeekRuns, MIN_RUNS_PER_WEEK)} / {MIN_RUNS_PER_WEEK} {runWord(MIN_RUNS_PER_WEEK)} this week · Best {s.best}
          </p>
        </div>
        <div className="flex gap-1">{freezeChips}</div>
      </section>
    );
  }

  const next = s.nextBadge;
  const prevBadge = [...BADGES].reverse().find((b) => b <= s.current) ?? 0;
  const pct = next ? Math.min(100, ((s.current - prevBadge) / (next - prevBadge)) * 100) : 100;

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-white/5">
      <div className="flex items-start justify-between">
        <p className="text-sm text-slate-400">Week streak</p>
        <p className="text-sm text-slate-400">Best: {s.best}</p>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <p className="flex items-center gap-2 text-5xl font-bold text-slate-100">
          <span className="text-4xl" aria-hidden="true">🔥</span>
          {s.current}
        </p>
        <div className="flex gap-1.5">{freezeChips}</div>
      </div>
      <p className="mt-1 text-sm text-slate-400">
        Weeks in a row with at least {MIN_RUNS_PER_WEEK} {runWord(MIN_RUNS_PER_WEEK)}. This week: {s.thisWeekRuns} so far.
      </p>

      <div className="mt-4 grid grid-cols-5 gap-2">
        {BADGES.map((b) => {
          const got = s.earned.includes(b);
          return (
            <div key={b} className="flex flex-col items-center rounded-xl bg-raised py-3">
              <span className={`text-xl ${got ? MEDAL[b] : "text-slate-600"}`} aria-hidden="true">
                {got ? "●" : "○"}
              </span>
              <span className={`mt-1 text-sm font-medium ${got ? "text-slate-100" : "text-slate-500"}`}>{b}</span>
            </div>
          );
        })}
      </div>

      {next && (
        <div className="mt-4">
          <div className="flex justify-between text-sm text-slate-400">
            <span>Next badge at {next} weeks.</span>
            <span>
              {s.current} / {next}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-raised">
            <div className="h-full rounded-full bg-exercise" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
      <p className="mt-3 text-sm text-slate-500">
        You earn a freeze every {FREEZE_EVERY} weeks, up to {MAX_FREEZES}. A missed week uses one, no harm done.
      </p>
    </section>
  );
}

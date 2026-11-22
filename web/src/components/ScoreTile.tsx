import type { DailyScore } from "../lib/types.ts";

function yesterdayKey(): string {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10);
}

// Compact Health 360 score for Home. Shows the last COMPLETE day (today is partial, so Movement
// would read low), matching the full gauge on Stats.
export function ScoreTile({ scores, onOpen }: { scores: DailyScore[]; onOpen: () => void }) {
  const score = scores.find((s) => s.date === yesterdayKey()) ?? scores[scores.length - 1];
  if (!score) return null;

  const pillars: { label: string; value: number | null; color: string }[] = [
    { label: "Move", value: score.movement_score, color: "bg-movement" },
    { label: "Exercise", value: score.exercise_score, color: "bg-exercise" },
    { label: "Weight", value: score.weight_score, color: "bg-weight" },
  ];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-4 rounded-2xl bg-surface p-4 text-left ring-1 ring-white/5 transition hover:bg-raised/60"
    >
      <div className="shrink-0 text-center">
        <p className="text-4xl font-bold leading-none text-slate-100">{Math.round(score.total)}</p>
        <p className="mt-1 text-[11px] text-slate-500">Health 360</p>
      </div>
      <div className="flex-1 space-y-1.5">
        {pillars.map((p) => (
          <div key={p.label} className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="w-14">{p.label}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
              {p.value != null && (
                <span
                  className={`block h-full rounded-full ${p.color}`}
                  style={{ width: `${Math.min(100, Math.max(0, p.value))}%` }}
                />
              )}
            </span>
            <span className="w-7 text-right tabular-nums">{p.value != null ? Math.round(p.value) : "—"}</span>
          </div>
        ))}
      </div>
    </button>
  );
}

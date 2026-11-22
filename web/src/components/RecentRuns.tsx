import type { Activity } from "../lib/types.ts";
import { formatDuration, formatPace } from "../lib/metrics.ts";
import { runsOf } from "../lib/stats.ts";

export function RecentRuns({ activities, limit = 3 }: { activities: Activity[]; limit?: number }) {
  const runs = [...runsOf(activities)]
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    .slice(0, limit);
  if (runs.length === 0) return null;

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-sm text-slate-400">Recent runs</h2>
        <span className="text-sm text-slate-500">{runsOf(activities).length} total</span>
      </div>
      <ul className="space-y-2">
        {runs.map((a) => {
          const km = a.distance_m / 1000;
          const pace = km > 0 ? a.moving_time_s / 60 / km : null;
          const day = new Date(a.started_at).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
          return (
            <li key={a.strava_id} className="flex items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-white/5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-black">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M13 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM9 21l2-6-3-2 2-5 4 2 3 1M11 15l4 2 1 4" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-slate-100">{a.name || "Run"}</p>
                <p className="truncate text-xs text-slate-400">
                  {day} · {formatDuration(a.moving_time_s)} · {formatPace(pace)}
                  {a.avg_hr ? ` · ${Math.round(a.avg_hr)} bpm` : ""}
                </p>
              </div>
              <span className="shrink-0 text-base font-semibold text-slate-100">{km.toFixed(1)} km</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

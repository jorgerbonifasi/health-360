import type { Activity, ActivityGroup } from "../lib/types.ts";
import { GROUP_COLORS } from "../lib/types.ts";
import { formatDuration, round1, startOfWeek } from "../lib/metrics.ts";

const DISTANCE_GROUPS: ActivityGroup[] = ["Run", "Ride", "Hike/Walk"];

// Simple stroke icons, one per sport, drawn inside a coloured tile like openGym's workout rows.
const ICON_PATH: Record<ActivityGroup, string> = {
  Run: "M13 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM9 21l2-6-3-2 2-5 4 2 3 1M11 15l4 2 1 4",
  Ride: "M6 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15l4-7h5l3 7M10 8l-1-2h-2",
  "Hike/Walk": "M3 19l6-10 4 6 2-3 6 7zM14 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  "Racket sports": "M10 14l-6 6M16 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM13 7l4 4",
  Other: "M4 10v4M8 7v10M16 7v10M20 10v4M8 12h8",
};

function SportTile({ group }: { group: ActivityGroup }) {
  const color = GROUP_COLORS[group];
  return (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
      style={{ backgroundColor: `${color}26`, color }}
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={ICON_PATH[group]} />
      </svg>
    </span>
  );
}

export function ActivityLog({ activities }: { activities: Activity[] }) {
  const weekStart = startOfWeek(new Date()).getTime();
  const week = activities
    .filter((a) => new Date(a.started_at).getTime() >= weekStart)
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-sm text-slate-400">This week</h2>
        <span className="text-sm text-slate-500">
          {week.length} {week.length === 1 ? "activity" : "activities"}
        </span>
      </div>
      {week.length === 0 ? (
        <p className="rounded-2xl bg-surface py-6 text-center text-sm text-slate-500 ring-1 ring-white/5">
          No activities logged this week.
        </p>
      ) : (
        <ul className="space-y-2">
          {week.map((a) => {
            const distanceSport = DISTANCE_GROUPS.includes(a.type_group);
            const headline = distanceSport ? `${round1(a.distance_m / 1000)} km` : formatDuration(a.moving_time_s);
            const secondary = distanceSport ? formatDuration(a.moving_time_s) : a.type_group;
            return (
              <li key={a.strava_id} className="flex items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-white/5">
                <SportTile group={a.type_group} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-slate-100">{a.name ?? a.type}</p>
                  <p className="truncate text-xs text-slate-400">
                    {new Date(a.started_at).toLocaleDateString(undefined, { weekday: "short" })} · {secondary}
                    {a.avg_hr ? ` · ${Math.round(a.avg_hr)} bpm` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-base font-semibold tabular-nums text-slate-100">{headline}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

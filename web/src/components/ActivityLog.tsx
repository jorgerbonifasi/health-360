import { Card } from "./Card.tsx";
import type { Activity, ActivityGroup } from "../lib/types.ts";
import { formatDuration, round1, startOfWeek } from "../lib/metrics.ts";

const ICONS: Record<ActivityGroup, string> = {
  Run: "🏃",
  Ride: "🚴",
  "Hike/Walk": "🥾",
  "Racket sports": "🎾",
  Other: "💪",
};

const DISTANCE_GROUPS: ActivityGroup[] = ["Run", "Ride", "Hike/Walk"];

export function ActivityLog({ activities }: { activities: Activity[] }) {
  const weekStart = startOfWeek(new Date()).getTime();
  const week = activities
    .filter((a) => new Date(a.started_at).getTime() >= weekStart)
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  return (
    <Card title="This week" subtitle={`${week.length} ${week.length === 1 ? "activity" : "activities"}`}>
      {week.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No activities logged this week.</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {week.map((a) => {
            const distanceSport = DISTANCE_GROUPS.includes(a.type_group);
            const headline = distanceSport
              ? `${round1(a.distance_m / 1000)} km`
              : formatDuration(a.moving_time_s);
            const secondary = distanceSport
              ? formatDuration(a.moving_time_s)
              : a.type_group;
            return (
              <li key={a.strava_id} className="flex items-center gap-3 py-2.5">
                <span className="text-xl" aria-hidden>
                  {ICONS[a.type_group]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-100">{a.name ?? a.type}</div>
                  <div className="text-xs text-slate-400">
                    {new Date(a.started_at).toLocaleDateString(undefined, {
                      weekday: "short",
                    })}{" "}
                    · {secondary}
                    {a.avg_hr ? ` · ${Math.round(a.avg_hr)} bpm` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right text-sm font-semibold tabular-nums text-slate-100">
                  {headline}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

import {
  ComposedChart,
  Bar,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card } from "./Card.tsx";
import type { Activity, Goal } from "../lib/types.ts";
import {
  bucketIndexOf,
  formatPace,
  goalValue,
  periodNoun,
  recentBuckets,
  round1,
  type Period,
} from "../lib/metrics.ts";

// Weekly/monthly running km (bars) + average pace (line). Half-marathon training view.
function buildRows(activities: Activity[], period: Period) {
  const buckets = recentBuckets(period, 12);
  const agg = buckets.map(() => ({ dist: 0, time: 0 }));
  for (const a of activities) {
    if (a.type_group !== "Run") continue;
    const idx = bucketIndexOf(buckets, new Date(a.started_at).getTime());
    if (idx < 0) continue;
    agg[idx].dist += a.distance_m;
    agg[idx].time += a.moving_time_s;
  }
  return buckets.map((b, i) => {
    const km = agg[i].dist / 1000;
    const pace = agg[i].dist > 0 ? agg[i].time / 60 / km : null; // min/km
    return { label: b.label, km: round1(km), pace: pace == null ? null : round1(pace) };
  });
}

export function RunningPanel({
  activities,
  goals,
  period,
}: {
  activities: Activity[];
  goals: Goal[];
  period: Period;
}) {
  const data = buildRows(activities, period);
  const hasRuns = data.some((d) => d.km > 0);
  // Weekly goal scaled to the bucket (a month ≈ 4.345 weeks).
  const weeklyGoal = goalValue(goals, "weekly_running_km_goal", NaN);
  const goal = Number.isNaN(weeklyGoal) ? NaN : period === "week" ? weeklyGoal : weeklyGoal * 4.345;

  return (
    <Card title="Running" subtitle={`${periodNoun(period)}ly km + avg pace · Run only`}>
      {!hasRuns ? (
        <p className="py-8 text-center text-sm text-slate-500">No runs recorded yet.</p>
      ) : (
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#1e293b" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} minTickGap={10} />
              <YAxis
                yAxisId="km"
                tick={{ fontSize: 11, fill: "#64748b" }}
                width={34}
                tickFormatter={(v) => String(Math.round(v))}
              />
              <YAxis
                yAxisId="pace"
                orientation="right"
                reversed
                tick={{ fontSize: 11, fill: "#64748b" }}
                width={40}
                tickFormatter={(v) => formatPace(v).replace("/km", "")}
              />
              <Tooltip
                cursor={{ fill: "#1e293b55" }}
                contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                labelStyle={{ color: "#e2e8f0" }}
                formatter={(value: number, name: string) =>
                  name === "pace" ? [formatPace(value), "avg pace"] : [`${value} km`, "distance"]
                }
              />
              {!Number.isNaN(goal) && (
                <ReferenceLine yAxisId="km" y={goal} stroke="#f59e0b" strokeDasharray="4 4" />
              )}
              <Bar yAxisId="km" dataKey="km" fill="#3b82f6" radius={[3, 3, 0, 0]} name="km" />
              <Line
                yAxisId="pace"
                type="monotone"
                dataKey="pace"
                stroke="#f97316"
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls
                name="pace"
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

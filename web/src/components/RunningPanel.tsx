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
  bucketCount,
  bucketIndexOf,
  formatPace,
  goalValue,
  periodAdjective,
  recentBuckets,
  round1,
  type Period,
} from "../lib/metrics.ts";

// Running km (bars) + average pace (line) per day / week / month. Half-marathon training view.
function buildRows(activities: Activity[], period: Period) {
  const buckets = recentBuckets(period, bucketCount(period));
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
  // Weekly goal scaled to the bucket (day = /7, month ≈ ×4.345 weeks).
  const weeklyGoal = goalValue(goals, "weekly_running_km_goal", NaN);
  const goal = Number.isNaN(weeklyGoal)
    ? NaN
    : period === "day" ? weeklyGoal / 7 : period === "week" ? weeklyGoal : weeklyGoal * 4.345;

  // Fit the pace axis to the actual data (padding + a minimum span, snapped to clean 30s/1min
  // ticks) instead of the wide 2:00–8:00 auto range, so the pace line uses the full height and
  // month-to-month differences read. Explicit ticks avoid Recharts collapsing to a single label.
  const { paceDomain, paceTicks } = ((): { paceDomain: [number, number]; paceTicks: number[] } => {
    const paces = data.map((d) => d.pace).filter((p): p is number => p != null);
    if (paces.length === 0) return { paceDomain: [4, 8], paceTicks: [4, 5, 6, 7, 8] };
    const PAD = 0.4;
    const MIN_SPAN = 1.5; // min/km — don't over-zoom a very consistent stretch
    let lo = Math.min(...paces) - PAD;
    let hi = Math.max(...paces) + PAD;
    if (hi - lo < MIN_SPAN) {
      const mid = (lo + hi) / 2;
      lo = mid - MIN_SPAN / 2;
      hi = mid + MIN_SPAN / 2;
    }
    const step = hi - lo > 3 ? 1 : 0.5; // 1-min ticks for a wide spread, else 30s
    lo = Math.max(0, Math.floor(lo / step) * step);
    hi = Math.ceil(hi / step) * step;
    const ticks: number[] = [];
    for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
    return { paceDomain: [lo, hi], paceTicks: ticks };
  })();

  return (
    <Card title="Running" subtitle={`${periodAdjective(period)} km + avg pace · Run only`}>
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
                domain={paceDomain}
                ticks={paceTicks}
                interval={0}
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

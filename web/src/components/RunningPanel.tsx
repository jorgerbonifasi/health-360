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
import type { Goal, WeeklyRunning } from "../lib/types.ts";
import { formatPace, goalValue, round1, shortDate } from "../lib/metrics.ts";

// Weekly running km (bars) + average pace (line, right axis). Half-marathon training view.
export function RunningPanel({
  weeklyRunning,
  goals,
}: {
  weeklyRunning: WeeklyRunning[];
  goals: Goal[];
}) {
  const goal = goalValue(goals, "weekly_running_km_goal", NaN);
  const data = weeklyRunning.map((r) => ({
    label: shortDate(r.week_start),
    km: round1(Number(r.km)),
    pace: r.avg_pace_min_km == null ? null : round1(Number(r.avg_pace_min_km)),
  }));

  return (
    <Card title="Running" subtitle="Weekly km + avg pace · Run only">
      {data.length === 0 ? (
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

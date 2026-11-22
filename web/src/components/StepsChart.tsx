import {
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card } from "./Card.tsx";
import type { DailyStep, Goal } from "../lib/types.ts";
import {
  bucketCount,
  bucketIndexOf,
  goalValue,
  periodNoun,
  recentBuckets,
  stepStreak,
  type Period,
} from "../lib/metrics.ts";

// Steps totalled per week/month (last 12 buckets), with a goal line scaled to the bucket length.
export function StepsChart({
  steps,
  goals,
  period,
  anchor,
}: {
  steps: DailyStep[];
  goals: Goal[];
  period: Period;
  anchor: Date;
}) {
  const dailyGoal = goalValue(goals, "daily_step_goal", 10000);
  const buckets = recentBuckets(period, bucketCount(period), anchor);
  const totals = buckets.map(() => 0);
  for (const s of steps) {
    const idx = bucketIndexOf(buckets, new Date(s.date + "T00:00:00").getTime());
    if (idx >= 0) totals[idx] += s.steps;
  }
  const data = buckets.map((b, i) => ({ label: b.label, steps: totals[i] }));
  const periodGoal = dailyGoal * (period === "day" ? 1 : period === "week" ? 7 : 30);
  const streak = stepStreak(steps, dailyGoal, anchor);

  return (
    <Card
      title="Steps"
      subtitle={`Total per ${periodNoun(period)} · goal ${periodGoal.toLocaleString()}/${periodNoun(period)}`}
    >
      <div className="mb-2 flex items-center gap-2 text-sm">
        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
          🔥 {streak}-day streak
        </span>
        <span className="text-xs text-slate-400">days at or above daily goal</span>
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#ffffff" strokeOpacity={0.06} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} minTickGap={10} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              width={34}
              tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
            />
            <Tooltip
              cursor={{ fill: "#ffffff0d" }}
              contentStyle={{ background: "#2c2c2e", border: "none", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#e2e8f0" }}
              formatter={(value: number) => [value.toLocaleString(), "steps"]}
            />
            <ReferenceLine y={periodGoal} stroke="#fbbf24" strokeDasharray="5 4" />
            <Bar dataKey="steps" radius={[4, 4, 0, 0]} maxBarSize={28}>
              {data.map((d) => (
                <Cell key={d.label} fill={d.steps >= periodGoal ? "#a3e635" : "#3a3a3c"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

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
import { goalValue, shortDate, stepStreak } from "../lib/metrics.ts";

export function StepsChart({ steps, goals }: { steps: DailyStep[]; goals: Goal[] }) {
  const goal = goalValue(goals, "daily_step_goal", 10000);
  const cutoff = Date.now() - 30 * 86400000;
  const data = steps
    .filter((s) => new Date(s.date).getTime() >= cutoff)
    .map((s) => ({ ...s, label: shortDate(s.date) }));
  const streak = stepStreak(steps, goal);

  return (
    <Card
      title="Daily steps"
      subtitle={`Last 30 days · goal ${goal.toLocaleString()}`}
    >
      <div className="mb-2 flex items-center gap-2 text-sm">
        <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-200">
          🔥 {streak}-day streak
        </span>
        <span className="text-xs text-slate-400">days at or above goal</span>
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} minTickGap={20} />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748b" }}
              width={34}
              tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))}
            />
            <Tooltip
              cursor={{ fill: "#1e293b55" }}
              contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
              labelStyle={{ color: "#e2e8f0" }}
            />
            <ReferenceLine y={goal} stroke="#f59e0b" strokeDasharray="4 4" />
            <Bar dataKey="steps" radius={[3, 3, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.date} fill={d.steps >= goal ? "#3b82f6" : "#475569"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

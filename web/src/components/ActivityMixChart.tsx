import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card } from "./Card.tsx";
import { ACTIVITY_GROUPS, GROUP_COLORS, type WeeklyActivityHours } from "../lib/types.ts";
import { round1, shortDate } from "../lib/metrics.ts";

// Pivot the per-(week, group) rows into one row per week with a column per activity group.
function pivot(rows: WeeklyActivityHours[]) {
  const byWeek = new Map<string, Record<string, number | string>>();
  for (const r of rows) {
    const row = byWeek.get(r.week_start) ?? { week_start: r.week_start, label: shortDate(r.week_start) };
    row[r.type_group] = round1(Number(r.hours));
    byWeek.set(r.week_start, row);
  }
  return [...byWeek.values()].sort((a, b) =>
    String(a.week_start).localeCompare(String(b.week_start)),
  );
}

export function ActivityMixChart({ weeklyHours }: { weeklyHours: WeeklyActivityHours[] }) {
  const data = pivot(weeklyHours);

  return (
    <Card title="Training load" subtitle="Active hours by sport · last 12 weeks">
      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">No activities yet.</p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid stroke="#1e293b" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} minTickGap={10} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={36} unit="h" />
              <Tooltip
                cursor={{ fill: "#1e293b55" }}
                contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                labelStyle={{ color: "#e2e8f0" }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {ACTIVITY_GROUPS.map((group) => (
                <Bar
                  key={group}
                  dataKey={group}
                  stackId="hours"
                  fill={GROUP_COLORS[group]}
                  radius={group === "Other" ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

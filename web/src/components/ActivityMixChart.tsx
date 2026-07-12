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
import { ACTIVITY_GROUPS, GROUP_COLORS, type Activity } from "../lib/types.ts";
import { bucketIndexOf, periodNoun, recentBuckets, round1, type Period } from "../lib/metrics.ts";

// Stacked active-hours-by-sport bars, bucketed weekly or monthly (last 12 buckets).
function buildRows(activities: Activity[], period: Period) {
  const buckets = recentBuckets(period, 12);
  const rows = buckets.map((b) => {
    const row: Record<string, number | string> = { label: b.label };
    for (const g of ACTIVITY_GROUPS) row[g] = 0;
    return row;
  });
  for (const a of activities) {
    const idx = bucketIndexOf(buckets, new Date(a.started_at).getTime());
    if (idx < 0) continue;
    rows[idx][a.type_group] = (rows[idx][a.type_group] as number) + a.moving_time_s / 3600;
  }
  for (const row of rows) {
    for (const g of ACTIVITY_GROUPS) row[g] = round1(row[g] as number);
  }
  return rows;
}

export function ActivityMixChart({
  activities,
  period,
}: {
  activities: Activity[];
  period: Period;
}) {
  const data = buildRows(activities, period);

  return (
    <Card title="Training load" subtitle={`Active hours by sport · last 12 ${periodNoun(period)}s`}>
      {activities.length === 0 ? (
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

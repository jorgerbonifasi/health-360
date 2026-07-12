import {
  ComposedChart,
  Line,
  Scatter,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card } from "./Card.tsx";
import type { Goal, WeightLog } from "../lib/types.ts";
import {
  goalValue,
  round1,
  shortDate,
  toDisplayWeight,
  weightSeriesWithTrailingAvg,
  WEIGHT_UNIT,
  type Period,
} from "../lib/metrics.ts";

export function WeightChart({
  weights,
  goals,
  period,
}: {
  weights: WeightLog[];
  goals: Goal[];
  period: Period;
}) {
  const rangeDays = period === "week" ? 90 : 365;
  const subtitle = `Last ${period === "week" ? "90 days" : "12 months"} · 7-day average · ${WEIGHT_UNIT}`;
  const cutoff = Date.now() - rangeDays * 86400000;
  const series = weightSeriesWithTrailingAvg(weights)
    .filter((p) => p.t >= cutoff)
    .map((p) => ({
      ...p,
      weight: round1(toDisplayWeight(p.weight)),
      avg: round1(toDisplayWeight(p.avg)),
      label: shortDate(p.date),
    }));
  const target = toDisplayWeight(goalValue(goals, "target_weight", NaN));

  if (series.length === 0) {
    return (
      <Card title="Weight" subtitle={subtitle}>
        <Empty />
      </Card>
    );
  }

  return (
    <Card title="Weight" subtitle={subtitle}>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} minTickGap={28} />
            <YAxis
              domain={["dataMin - 1", "dataMax + 1"]}
              tick={{ fontSize: 11, fill: "#64748b" }}
              width={44}
              tickFormatter={(v) => String(Math.round(v))}
            />
            <Tooltip
              contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
              labelStyle={{ color: "#e2e8f0" }}
            />
            <Scatter dataKey="weight" fill="#334155" name="Measurement" />
            <Line
              type="monotone"
              dataKey="avg"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              name="7-day avg"
              isAnimationActive={false}
            />
            {!Number.isNaN(target) && (
              <ReferenceLine
                y={target}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                label={{ value: `Goal ${Math.round(target)}`, fill: "#f59e0b", fontSize: 11, position: "insideTopRight" }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function Empty() {
  return <p className="py-8 text-center text-sm text-slate-500">No weight data yet.</p>;
}

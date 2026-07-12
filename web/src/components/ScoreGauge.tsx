import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import type { DailyScore } from "../lib/types.ts";
import { Delta } from "./Delta.tsx";
import {
  average,
  periodNoun,
  pctDelta,
  recentBuckets,
  trailingBounds,
  type Period,
} from "../lib/metrics.ts";

function scoreColor(v: number): string {
  if (v >= 80) return "#10b981"; // emerald
  if (v >= 60) return "#f59e0b"; // amber
  if (v >= 40) return "#f97316"; // orange
  return "#ef4444"; // red
}

// Small horizontal pillar bar with label + value.
function PillarBar({ label, value, color }: { label: string; value: number | null; color: string }) {
  const pct = value == null ? 0 : (Math.min(value, 120) / 120) * 100;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-slate-300">{label}</span>
        <span className="tabular-nums text-slate-400">
          {value == null ? "no data" : Math.round(value)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-700">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: value == null ? "#475569" : color }}
        />
      </div>
    </div>
  );
}

function scoreEpoch(s: DailyScore): number {
  return new Date(s.date + "T00:00:00").getTime();
}

export function ScoreGauge({ scores, period }: { scores: DailyScore[]; period: Period }) {
  const today = scores[scores.length - 1];
  const total = today ? Math.round(today.total) : null;

  // Sparkline: average score per bucket over the last 12 buckets.
  const buckets = recentBuckets(period, 12);
  const spark = buckets.map((b) => {
    const inB = scores.filter((s) => {
      const t = scoreEpoch(s);
      return t >= b.start && t < b.end;
    });
    return { label: b.label, total: average(inB.map((s) => s.total)) };
  });

  // WoW/MoM delta: current trailing-window avg vs previous.
  const avgInBounds = (offset: number) => {
    const { start, end } = trailingBounds(period, offset);
    return average(scores.filter((s) => scoreEpoch(s) >= start && scoreEpoch(s) < end).map((s) => s.total));
  };
  const cur = avgInBounds(0);
  const prev = avgInBounds(-1);
  const delta = cur != null && prev != null ? pctDelta(cur, prev) : null;

  // SVG ring geometry.
  const size = 160;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const value = total ?? 0;
  const dash = (Math.min(value, 100) / 100) * circ;
  const color = scoreColor(value);

  return (
    <div className="rounded-2xl bg-slate-800/60 p-5 shadow-lg ring-1 ring-white/5">
      <div className="flex items-center gap-5">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#334155" strokeWidth={stroke} />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ - dash}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold tabular-nums" style={{ color }}>
              {total ?? "—"}
            </span>
            <span className="text-xs text-slate-400">Health 360</span>
          </div>
        </div>

        <div className="flex-1 space-y-2">
          <PillarBar label="Movement" value={today?.movement_score ?? null} color="#3b82f6" />
          <PillarBar label="Exercise" value={today?.exercise_score ?? null} color="#f97316" />
          <PillarBar label="Weight" value={today?.weight_score ?? null} color="#10b981" />
        </div>
      </div>

      {spark.some((p) => p.total != null) && (
        <div className="mt-4 h-12">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spark} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
              <YAxis domain={[0, 100]} hide />
              <Line
                type="monotone"
                dataKey="total"
                stroke={color}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="mt-1 flex items-center justify-center gap-2 text-[11px] text-slate-500">
        <span>12-{periodNoun(period)} trend</span>
        <Delta value={delta} unit="%" goodWhen="up" suffix={`vs last ${periodNoun(period)}`} />
      </div>
    </div>
  );
}

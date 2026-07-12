import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import type { DailyScore } from "../lib/types.ts";

function scoreColor(v: number): string {
  if (v >= 80) return "#10b981"; // emerald
  if (v >= 60) return "#f59e0b"; // amber
  if (v >= 40) return "#f97316"; // orange
  return "#ef4444"; // red
}

// Small horizontal pillar bar with label + value.
function PillarBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number | null;
  color: string;
}) {
  const pct = value == null ? 0 : Math.min(value, 120) / 120 * 100;
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

export function ScoreGauge({ scores }: { scores: DailyScore[] }) {
  const today = scores[scores.length - 1];
  const total = today ? Math.round(today.total) : null;
  const last30 = scores.slice(-30);

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

      {last30.length > 1 && (
        <div className="mt-4 h-12">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={last30} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
              <YAxis domain={[0, 100]} hide />
              <Line
                type="monotone"
                dataKey="total"
                stroke={color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-1 text-center text-[11px] text-slate-500">30-day trend</p>
    </div>
  );
}

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Goal, WeightLog } from "../lib/types.ts";
import { round1, toDisplayWeight, WEIGHT_UNIT } from "../lib/metrics.ts";
import { weightStats } from "../lib/stats.ts";

const RANGES = [
  { id: "1M", days: 30 },
  { id: "3M", days: 90 },
  { id: "1Y", days: 365 },
  { id: "All", days: 100000 },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

// openGym-style body-weight card: big current number, change since the last weigh-in, the goal
// line, a 1M/3M/1Y/All area chart and the weekly trend. Weight is stored in kg, shown in WEIGHT_UNIT.
export function BodyWeightCard({
  weights,
  goals,
  defaultRange = "3M",
  showRanges = true,
}: {
  weights: WeightLog[];
  goals: Goal[];
  defaultRange?: RangeId;
  showRanges?: boolean;
}) {
  const [range, setRange] = useState<RangeId>(defaultRange);
  const st = weightStats(weights, goals);

  if (st.latestKg == null) {
    return (
      <section className="rounded-2xl bg-surface p-4 ring-1 ring-white/5">
        <h2 className="text-base font-semibold text-slate-100">Body weight</h2>
        <p className="mt-2 text-sm text-slate-400">No weigh-ins yet.</p>
      </section>
    );
  }

  const days = RANGES.find((r) => r.id === range)!.days;
  const lastT = new Date(st.latestAt!).getTime();
  const data = [...weights]
    .map((w) => ({ t: new Date(w.measured_at).getTime(), v: round1(toDisplayWeight(w.weight_kg)) }))
    .filter((p) => p.t >= lastT - days * 86400000)
    .sort((a, b) => a.t - b.t);

  const goal = st.goalKg != null ? round1(toDisplayWeight(st.goalKg)) : null;
  const values = data.map((d) => d.v).concat(goal != null ? [goal] : []);
  const pad = 1;
  const domain: [number, number] = [Math.floor(Math.min(...values) - pad), Math.ceil(Math.max(...values) + pad)];

  // One tick per month (or per week on the 1M view) so labels never repeat.
  const ticks: number[] = [];
  if (data.length > 1) {
    const first = data[0].t;
    const last = data[data.length - 1].t;
    if (days <= 30) {
      for (let t = first; t <= last; t += 7 * 86400000) ticks.push(t);
    } else {
      const d = new Date(first);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      d.setMonth(d.getMonth() + 1);
      const every = days > 365 ? 3 : 1; // thin out the 1Y / All views
      for (let i = 0; d.getTime() <= last; d.setMonth(d.getMonth() + 1), i++) if (i % every === 0) ticks.push(d.getTime());
    }
  }

  const delta = st.deltaKg != null ? round1(toDisplayWeight(st.deltaKg)) : null;
  const toGoal = st.toGoalKg != null ? round1(toDisplayWeight(Math.abs(st.toGoalKg))) : null;
  const trend = st.trendKgPerWeek != null ? Math.round(toDisplayWeight(st.trendKgPerWeek) * 100) / 100 : null;
  // Down is the usual goal; colour the delta by whether it moves toward the goal weight.
  const towardGoal = st.goalKg != null && st.deltaKg != null ? Math.abs(st.latestKg - st.deltaKg - st.goalKg) > Math.abs(st.latestKg - st.goalKg) : null;

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-white/5">
      <div className="flex items-start justify-between">
        <h2 className="text-base font-semibold text-slate-100">Body weight</h2>
        {goal != null && (
          <span className="text-sm text-amber-300">
            ◎ {goal}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-end justify-between">
        <p className="text-4xl font-bold leading-none text-slate-100">
          {round1(toDisplayWeight(st.latestKg))}
          <span className="ml-1 text-lg font-medium text-slate-400">{WEIGHT_UNIT}</span>
          {delta != null && delta !== 0 && (
            <span className={`ml-2 text-sm font-medium ${towardGoal ? "text-accent" : "text-slate-400"}`}>
              {delta < 0 ? "↓" : "↑"} {Math.abs(delta)}
            </span>
          )}
        </p>
        <span className="text-xs text-slate-500">{fmtDay(st.latestAt!)}</span>
      </div>

      {goal != null && toGoal != null && (
        <p className="mt-1 text-sm text-amber-300">
          ◎ Goal {goal} {WEIGHT_UNIT} · {toGoal} {WEIGHT_UNIT} to {st.toGoalKg! > 0 ? "lose" : "gain"}
        </p>
      )}

      {showRanges && (
        <div className="mt-3 flex rounded-lg bg-raised p-0.5" role="tablist">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={range === r.id}
              onClick={() => setRange(r.id)}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
                range === r.id ? "bg-surface text-slate-100" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {r.id}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="bw-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a3e635" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#a3e635" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#ffffff" strokeOpacity={0.06} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={ticks}
              tickFormatter={(t) => new Date(t).toLocaleDateString(undefined, { month: "short", day: days <= 30 ? "numeric" : undefined })}
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis domain={domain} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip
              contentStyle={{ background: "#2c2c2e", border: "none", borderRadius: 8, fontSize: 12 }}
              labelFormatter={(t) => fmtDay(new Date(t as number).toISOString())}
              formatter={(v: number) => [`${v} ${WEIGHT_UNIT}`, "Weight"]}
            />
            {goal != null && <ReferenceLine y={goal} stroke="#fbbf24" strokeDasharray="5 4" />}
            <Area type="monotone" dataKey="v" stroke="#a3e635" strokeWidth={2} fill="url(#bw-fill)" dot={false} activeDot={{ r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {trend != null && (
        <p className="mt-2 text-sm text-slate-400">
          Trend {trend > 0 ? "+" : ""}
          {trend} {WEIGHT_UNIT} a week
          {st.trendPct != null ? ` (${st.trendPct > 0 ? "+" : ""}${st.trendPct.toFixed(2)} %)` : ""}
        </p>
      )}
    </section>
  );
}

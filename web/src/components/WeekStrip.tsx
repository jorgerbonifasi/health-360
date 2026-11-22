import { useState } from "react";
import type { Activity, RunPlan } from "../lib/types.ts";

const DAY_MS = 86400000;
const LETTERS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

// Local calendar date as YYYY-MM-DD (not UTC), so an evening run lands on the day you ran it.
function localKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mondayOf(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() - ((c.getDay() + 6) % 7));
  return c;
}

// Mo-Su strip like openGym's home: lime dot = you ran, grey dot = a run is planned, today in a lime
// pill. Arrows page between weeks. Below it, how far through the weekly km goal you are.
export function WeekStrip({
  activities,
  plans,
  weeklyKmGoal,
}: {
  activities: Activity[];
  plans: RunPlan[];
  weeklyKmGoal: number | null;
}) {
  const [offset, setOffset] = useState(0); // weeks back from this one
  const today = localKey(new Date());
  const start = new Date(mondayOf(new Date()).getTime() - offset * 7 * DAY_MS);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const keys = days.map(localKey);

  const runKm = new Map<string, number>();
  for (const a of activities) {
    if (a.type_group !== "Run") continue;
    const k = localKey(new Date(a.started_at));
    runKm.set(k, (runKm.get(k) ?? 0) + a.distance_m / 1000);
  }
  const planned = new Set(plans.filter((p) => p.workout_type !== "rest").map((p) => p.date));

  const weekKm = keys.reduce((s, k) => s + (runKm.get(k) ?? 0), 0);
  const label =
    offset === 0
      ? "This week"
      : offset === 1
      ? "Last week"
      : `${days[0].toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-white/5">
      <div className="mb-3 flex items-center justify-between text-slate-300">
        <button
          type="button"
          aria-label="Previous week"
          onClick={() => setOffset((o) => Math.min(o + 1, 52))}
          className="flex h-8 w-8 items-center justify-center rounded-full text-lg hover:bg-raised"
        >
          ‹
        </button>
        <span className="text-sm">{label}</span>
        <button
          type="button"
          aria-label="Next week"
          onClick={() => setOffset((o) => Math.max(o - 1, 0))}
          disabled={offset === 0}
          className="flex h-8 w-8 items-center justify-center rounded-full text-lg hover:bg-raised disabled:opacity-30"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 text-center">
        {days.map((d, i) => {
          const k = keys[i];
          const isToday = k === today;
          const ran = (runKm.get(k) ?? 0) > 0;
          const plan = planned.has(k);
          return (
            <div key={k} className="flex flex-col items-center gap-1.5">
              <span className="text-xs text-slate-500">{LETTERS[i]}</span>
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full text-base ${
                  isToday ? "bg-accent font-semibold text-black" : "text-slate-200"
                }`}
              >
                {d.getDate()}
              </span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  ran ? "bg-accent" : plan ? "bg-slate-500" : "bg-transparent"
                }`}
              />
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-center text-sm text-slate-400">
        {weekKm.toFixed(1)} km{weeklyKmGoal ? ` of ${weeklyKmGoal} km` : ""}{offset === 0 ? " this week" : ""}
      </p>
    </section>
  );
}

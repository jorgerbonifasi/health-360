import { useState } from "react";
import { supabase } from "../lib/supabase.ts";
import type { Activity, RunPlan } from "../lib/types.ts";
import { ADHERENCE_LABELS } from "../lib/types.ts";

const DAY_MS = 86400000;
const LETTERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function key(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function mondayOf(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() - ((c.getDay() + 6) % 7));
  return c;
}
function pace(m: number): string {
  const min = Math.floor(m);
  return `${min}:${String(Math.round((m - min) * 60)).padStart(2, "0")}`;
}

const TYPE_STYLE: Record<string, string> = {
  easy: "bg-emerald-500/15 text-emerald-300",
  recovery: "bg-sky-500/15 text-sky-300",
  tempo: "bg-amber-500/15 text-amber-300",
  intervals: "bg-rose-500/15 text-rose-300",
  long: "bg-violet-500/15 text-violet-300",
  rest: "bg-raised text-slate-400",
};

async function functionError(error: { message: string; context?: Response }): Promise<string> {
  try {
    const body = await error.context?.json?.();
    if (body?.error) return String(body.error);
  } catch (_) { /* keep generic message */ }
  return error.message;
}

// The coach's week as seven day-cards (openGym's Plan tab, for running): what's asked, what you did,
// and the week's km against your goal. "Plan my week" asks the coach to lay out the days ahead.
export function WeekPlan({
  plans,
  activities,
  weeklyKmGoal,
  onChanged,
}: {
  plans: RunPlan[];
  activities: Activity[];
  weeklyKmGoal: number | null;
  onChanged: () => void | Promise<void>;
}) {
  const [offset, setOffset] = useState(0); // weeks from the current one (-8..+1)
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const todayKey = key(new Date());
  const monday = new Date(mondayOf(new Date()).getTime() + offset * 7 * DAY_MS);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  const ranKm = new Map<string, number>();
  for (const a of activities) {
    if (a.type_group !== "Run") continue;
    const k = key(new Date(a.started_at));
    ranKm.set(k, (ranKm.get(k) ?? 0) + a.distance_m / 1000);
  }
  const byDate = new Map(plans.map((p) => [p.date, p]));

  let plannedKm = 0;
  let doneKm = 0;
  for (const d of days) {
    const k = key(d);
    plannedKm += byDate.get(k)?.target_distance_km ?? 0;
    doneKm += ranKm.get(k) ?? 0;
  }
  const anyPlan = days.some((d) => byDate.has(key(d)));
  const label = offset === 0 ? "This week" : offset === 1 ? "Next week" : offset === -1 ? "Last week" : `${days[0].toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;

  const planWeek = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await supabase.functions.invoke("plan-week", { body: {} });
      if (res.error) throw new Error(await functionError(res.error as { message: string; context?: Response }));
      const data = res.data as { summary?: string; window?: string; error?: string };
      if (data?.error) throw new Error(data.error);
      setSummary(data.summary ?? null);
      // The planner may have laid out next week (late Sunday); jump there so you see it.
      setOffset(data.window === "next_week" ? 1 : 0);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't plan the week");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="rounded-2xl bg-surface p-4 ring-1 ring-white/5">
        <div className="flex items-center justify-between text-slate-300">
          <button type="button" aria-label="Previous week" onClick={() => setOffset((o) => Math.max(o - 1, -8))} className="flex h-8 w-8 items-center justify-center rounded-full text-lg hover:bg-raised">‹</button>
          <span className="text-sm">{label}</span>
          <button type="button" aria-label="Next week" onClick={() => setOffset((o) => Math.min(o + 1, 1))} disabled={offset >= 1} className="flex h-8 w-8 items-center justify-center rounded-full text-lg hover:bg-raised disabled:opacity-30">›</button>
        </div>
        <div className="mt-2 grid grid-cols-3 text-center">
          <Stat label="Planned" value={`${plannedKm.toFixed(0)} km`} />
          <Stat label="Done" value={`${doneKm.toFixed(1)} km`} accent />
          <Stat label="Goal" value={weeklyKmGoal ? `${weeklyKmGoal} km` : "—"} />
        </div>
        {weeklyKmGoal ? (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (doneKm / weeklyKmGoal) * 100)}%` }} />
          </div>
        ) : null}
        {summary && <p className="mt-3 text-sm text-slate-300">{summary}</p>}
      </div>

      <button
        type="button"
        onClick={planWeek}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? (
          <>
            <span className="inline-block animate-spin">⟳</span> Planning your week…
          </>
        ) : anyPlan ? (
          "Replan the days ahead"
        ) : (
          "Plan my week"
        )}
      </button>
      {error && <p className="text-xs text-rose-400">{error}</p>}

      <ul className="space-y-2">
        {days.map((d, i) => {
          const k = key(d);
          const plan = byDate.get(k);
          const km = ranKm.get(k) ?? 0;
          const isToday = k === todayKey;
          const past = k < todayKey;
          const rest = plan?.workout_type === "rest";
          const expanded = open === k;
          const chip = plan?.adherence ? ADHERENCE_LABELS[plan.adherence] : null;

          let status: { text: string; cls: string };
          if (km > 0) status = { text: `Ran ${km.toFixed(1)} km`, cls: "text-accent" };
          else if (rest) status = { text: "Rest", cls: "text-slate-400" };
          else if (past && plan) status = { text: "No run", cls: "text-slate-500" };
          else if (plan) status = { text: isToday ? "Today" : "Planned", cls: "text-slate-300" };
          else status = { text: past ? "" : "—", cls: "text-slate-600" };

          // A past day with nothing planned and nothing run needs no card, just a quiet line.
          if (past && !plan && km === 0) {
            return (
              <li key={k} className="flex items-center gap-3 px-3 py-1 text-xs text-slate-600">
                <span className="w-12 text-center">{LETTERS[i]} {d.getDate()}</span>
                <span>Nothing planned</span>
              </li>
            );
          }

          return (
            <li key={k} className={`rounded-2xl bg-surface ring-1 ${isToday ? "ring-accent/40" : "ring-white/5"}`}>
              <button
                type="button"
                onClick={() => plan && setOpen(expanded ? null : k)}
                disabled={!plan}
                className="flex w-full items-center gap-3 p-3 text-left"
              >
                <div className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl ${isToday ? "bg-accent text-black" : "bg-raised text-slate-200"}`}>
                  <span className="text-[10px] uppercase opacity-70">{LETTERS[i]}</span>
                  <span className="text-lg font-semibold leading-none">{d.getDate()}</span>
                </div>
                <div className="min-w-0 flex-1">
                  {plan ? (
                    <>
                      <p className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${TYPE_STYLE[plan.workout_type] ?? TYPE_STYLE.rest}`}>
                          {plan.workout_type}
                        </span>
                        {!rest && plan.target_distance_km != null && (
                          <span className="text-base font-semibold text-slate-100">{plan.target_distance_km} km</span>
                        )}
                      </p>
                      {!rest && plan.target_pace_min_km_low != null && plan.target_pace_min_km_high != null && (
                        <p className="mt-0.5 truncate text-xs text-slate-400">
                          {pace(plan.target_pace_min_km_low)}–{pace(plan.target_pace_min_km_high)}/km
                          {plan.target_hr_low != null && plan.target_hr_high != null ? ` · ${plan.target_hr_low}–${plan.target_hr_high} bpm` : ""}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-600">Nothing planned</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-medium ${status.cls}`}>{status.text}</p>
                  {chip && (
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${chip.className}`}>{chip.label}</span>
                  )}
                </div>
              </button>
              {expanded && plan && (
                <div className="space-y-1 border-t border-white/5 px-3 pb-3 pt-2 text-sm text-slate-300">
                  {plan.why && <p>{plan.why}</p>}
                  {plan.reminder && <p className="text-slate-500">{plan.reminder}</p>}
                  {plan.review_text && <p className="pt-1 text-slate-200">{plan.review_text}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-bold ${accent ? "text-accent" : "text-slate-100"}`}>{value}</p>
    </div>
  );
}

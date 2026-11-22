import type { Activity, RunPlan } from "../lib/types.ts";

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtPace(minKm: number): string {
  const m = Math.floor(minKm);
  const s = Math.round((minKm - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Home's "Today" card: what the coach asked for, whether you've run, and one button to act.
export function TodayCard({
  plans,
  activities,
  onOpenCoach,
}: {
  plans: RunPlan[];
  activities: Activity[];
  onOpenCoach: () => void;
}) {
  const today = utcToday();
  const plan = plans.find((p) => p.date === today);
  const ranToday = activities.filter(
    (a) => a.type_group === "Run" && a.started_at.slice(0, 10) === today,
  );
  const km = ranToday.reduce((s, a) => s + a.distance_m / 1000, 0);

  const isRest = plan?.workout_type === "rest";
  const headline = !plan ? "No run planned yet" : isRest ? "Rest day" : `${cap(plan.workout_type)} run`;
  const detail =
    plan && !isRest
      ? [
          plan.target_distance_km != null ? `${plan.target_distance_km} km` : null,
          plan.target_pace_min_km_low != null && plan.target_pace_min_km_high != null
            ? `${fmtPace(plan.target_pace_min_km_low)}–${fmtPace(plan.target_pace_min_km_high)}/km`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  const action = ranToday.length ? (plan?.reviewed_at ? "See review" : "Review") : plan ? "Open" : "Get run";

  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-white/5">
      <div className="flex items-center gap-3 rounded-xl bg-raised p-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-black">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M13 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM9 21l2-6-3-2 2-5 4 2 3 1M11 15l4 2 1 4" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-400">Today</p>
          <p className="truncate text-lg font-semibold text-slate-100">{headline}</p>
          {detail && <p className="truncate text-xs text-slate-400">{detail}</p>}
        </div>
        <button
          type="button"
          onClick={onOpenCoach}
          className="shrink-0 rounded-lg bg-accent/15 px-3 py-1.5 text-sm font-semibold text-accent transition hover:bg-accent/25"
        >
          {action}
        </button>
      </div>
      {ranToday.length > 0 && (
        <p className="mt-3 text-center text-sm text-slate-400">You've run {km.toFixed(1)} km today</p>
      )}
    </section>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

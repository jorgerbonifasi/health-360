import type { HealthData } from "../hooks/useHealthData.ts";
import { Card } from "../components/Card.tsx";
import { ADHERENCE_LABELS } from "../lib/types.ts";

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// For now this is the coach's history: each day's prescription and how it went. The weekly plan
// (the coming seven days toward your km goal) replaces the top of this page in the next phase.
export function PlanPage({ data }: { data: HealthData }) {
  const plans = data.runPlans;
  if (plans.length === 0) {
    return (
      <Card title="Plan" subtitle="Your coach's plans will appear here">
        <p className="text-sm text-slate-400">Ask the coach for today's run to start your history.</p>
      </Card>
    );
  }

  return (
    <Card title="Plan history" subtitle="What the coach asked for, and how it went">
      <ul className="divide-y divide-white/5">
        {plans.map((p) => {
          const rest = p.workout_type === "rest";
          const chip = p.adherence ? ADHERENCE_LABELS[p.adherence] : null;
          return (
            <li key={p.date} className="flex items-center gap-3 py-3">
              <div className="w-20 shrink-0 text-xs text-slate-400">{fmtDate(p.date)}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-100">
                  {rest ? (
                    "Rest day"
                  ) : (
                    <>
                      <span className="capitalize">{p.workout_type}</span>
                      {p.target_distance_km != null ? ` · ${p.target_distance_km} km` : ""}
                    </>
                  )}
                </p>
                {p.actual_distance_km != null && (
                  <p className="text-xs text-slate-500">Ran {p.actual_distance_km.toFixed(1)} km</p>
                )}
              </div>
              {chip ? (
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${chip.className}`}>
                  {chip.label}
                </span>
              ) : (
                <span className="shrink-0 text-[10px] text-slate-600">not reviewed</span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

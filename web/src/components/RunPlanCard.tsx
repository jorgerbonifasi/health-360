import { useState } from "react";
import { Card } from "./Card.tsx";
import { supabase } from "../lib/supabase.ts";
import { dayLabel } from "../lib/metrics.ts";
import { ADHERENCE_LABELS, type RunPlan } from "../lib/types.ts";

// AI running coach: sends how you feel + recent training (server-side) to Claude and shows
// today's recommended run. The Anthropic key lives on the Edge Function, never in the browser.
//
// Plans are stored in run_plans (so they survive a reload), which is also what makes the review
// possible: once a plan has a day's activities to compare against, "How did <day> go?" asks the
// coach to grade the prescription against what actually happened.

// run-plan stamps plans with the UTC date, so match on UTC here too.
function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtPace(minKm: number | null): string {
  if (minKm == null || !isFinite(minKm)) return "—";
  const m = Math.floor(minKm);
  const s = Math.round((minKm - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

// "8.2 km @ 5:12/km · HR 162" — only the parts we actually have.
function actualSummary(p: RunPlan): string | null {
  const parts: string[] = [];
  if (p.actual_distance_km != null) parts.push(`${p.actual_distance_km.toFixed(1)} km`);
  if (p.actual_pace_min_km != null) parts.push(`@ ${fmtPace(p.actual_pace_min_km)}`);
  if (p.actual_avg_hr != null) parts.push(`HR ${Math.round(p.actual_avg_hr)}`);
  return parts.length ? parts.join(" · ") : null;
}

// Pull the function's own error body (e.g. "ANTHROPIC_API_KEY is not set") out of the generic
// "non-2xx status code" wrapper supabase-js returns.
async function invokeError(error: { message: string; context?: Response }): Promise<string> {
  try {
    const body = await error.context?.json?.();
    if (body?.error) return String(body.error);
  } catch (_) { /* keep the generic message */ }
  return error.message;
}

export function RunPlanCard({
  plans,
  onChanged,
}: {
  plans: RunPlan[]; // newest first
  onChanged: () => void | Promise<void>;
}) {
  const [feel, setFeel] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = utcToday();
  const todayPlan = plans.find((p) => p.date === today);
  // Oldest business first: the most recent plan still waiting on a verdict.
  const pending = plans.find((p) => !p.reviewed_at && p.date < today);
  const latestReview = plans.find((p) => p.reviewed_at && p.review_text);

  const plan = fresh ?? todayPlan?.plan_text ?? null;

  const getPlan = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await supabase.functions.invoke("run-plan", { body: { feel } });
      if (res.error) throw new Error(await invokeError(res.error as { message: string; context?: Response }));
      const data = res.data as { plan?: string; error?: string };
      if (data?.error) throw new Error(data.error);
      setFresh(data?.plan ?? "No plan returned.");
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't get a plan");
    } finally {
      setLoading(false);
    }
  };

  const review = async (date: string) => {
    if (reviewing) return;
    setReviewing(true);
    setError(null);
    try {
      const res = await supabase.functions.invoke("run-review", { body: { date } });
      if (res.error) throw new Error(await invokeError(res.error as { message: string; context?: Response }));
      const data = res.data as { error?: string };
      if (data?.error) throw new Error(data.error);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't review that run");
    } finally {
      setReviewing(false);
    }
  };

  return (
    <Card title="Coach" subtitle="Today's run, from your last 2 weeks of training">
      <div className="space-y-3">
        {latestReview && (
          <div className="rounded-xl bg-slate-900/60 p-3 ring-1 ring-white/5">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-300">
                How {dayLabel(latestReview.date)} went
              </span>
              {latestReview.adherence && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${
                    ADHERENCE_LABELS[latestReview.adherence].className
                  }`}
                >
                  {ADHERENCE_LABELS[latestReview.adherence].label}
                </span>
              )}
            </div>
            <p className="text-sm leading-relaxed text-slate-200">{latestReview.review_text}</p>
            {actualSummary(latestReview) && (
              <p className="mt-1.5 text-[11px] text-slate-500">
                You ran {actualSummary(latestReview)}
              </p>
            )}
          </div>
        )}

        {pending && (
          <button
            type="button"
            onClick={() => review(pending.date)}
            disabled={reviewing}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 py-2 text-sm font-medium text-slate-200 ring-1 ring-white/10 transition hover:text-white disabled:opacity-60"
          >
            {reviewing ? (
              <>
                <span className="inline-block animate-spin">⟳</span> Reviewing…
              </>
            ) : (
              <>How did {dayLabel(pending.date)} go?</>
            )}
          </button>
        )}

        <input
          type="text"
          value={feel}
          onChange={(e) => setFeel(e.target.value)}
          placeholder="How do you feel today? (optional — e.g. legs sore, slept badly)"
          className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10 placeholder:text-slate-500 focus:outline-none focus:ring-blue-500"
          onKeyDown={(e) => e.key === "Enter" && getPlan()}
        />

        <button
          type="button"
          onClick={getPlan}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-60"
        >
          {loading ? (
            <>
              <span className="inline-block animate-spin">⟳</span> Coaching…
            </>
          ) : (
            <>🏃 {plan ? "Regenerate plan" : "Get today's run"}</>
          )}
        </button>

        {error && <p className="text-xs text-rose-400">{error}</p>}

        {plan && !loading && (
          <div className="whitespace-pre-line rounded-xl bg-slate-900/60 p-3 text-sm leading-relaxed text-slate-200 ring-1 ring-white/5">
            {plan}
          </div>
        )}
      </div>
    </Card>
  );
}

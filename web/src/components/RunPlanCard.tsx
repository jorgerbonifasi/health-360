import { useState } from "react";
import { Card } from "./Card.tsx";
import { supabase } from "../lib/supabase.ts";

// AI running coach: sends how you feel + recent training (server-side) to Claude and shows
// today's recommended run. The Anthropic key lives on the Edge Function, never in the browser.
export function RunPlanCard() {
  const [feel, setFeel] = useState("");
  const [plan, setPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getPlan = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await supabase.functions.invoke("run-plan", { body: { feel } });
      if (res.error) {
        // Surface the function's own error body (e.g. "ANTHROPIC_API_KEY is not set") instead of
        // the generic "non-2xx status code" wrapper.
        let message = res.error.message;
        try {
          const body = await (res.error as { context?: Response }).context?.json?.();
          if (body?.error) message = body.error;
        } catch (_) { /* keep the generic message */ }
        throw new Error(message);
      }
      const data = res.data as { plan?: string; error?: string };
      if (data?.error) throw new Error(data.error);
      setPlan(data?.plan ?? "No plan returned.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't get a plan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="Coach" subtitle="Today's run, from your last 2 weeks of training">
      <div className="space-y-3">
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

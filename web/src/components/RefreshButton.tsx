import { useState } from "react";
import { supabase } from "../lib/supabase.ts";

// Triggers a server-side sync (Strava + Withings via reconcile, then compute-scores) using the
// anon key, then re-fetches the dashboard. Apple Health steps can't be pulled (push-only), so
// this refreshes Strava, Withings, and the Score.
export function RefreshButton({ onRefreshed }: { onRefreshed: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const reconcile = await supabase.functions.invoke("reconcile", { body: { source: "manual" } });
      if (reconcile.error) throw reconcile.error;
      const scores = await supabase.functions.invoke("compute-scores", { body: { source: "manual" } });
      if (scores.error) throw scores.error;
      await onRefreshed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={busy}
      title={error ? `Sync failed: ${error}` : "Sync Strava + Withings"}
      aria-label="Sync data"
      className={`flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-base ring-1 ring-white/10 transition hover:text-white disabled:opacity-60 ${
        error ? "text-rose-400" : "text-slate-300"
      }`}
    >
      <span className={busy ? "inline-block animate-spin" : "inline-block"}>↻</span>
    </button>
  );
}

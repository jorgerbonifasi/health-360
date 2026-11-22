import type { Insight } from "../lib/insights.ts";
import type { Tab } from "./TabBar.tsx";

const TONE: Record<Insight["tone"], { icon: string; chip: string }> = {
  good: { icon: "bg-accent text-black", chip: "text-accent" },
  warn: { icon: "bg-amber-400 text-black", chip: "text-amber-300" },
  info: { icon: "bg-sky-400 text-black", chip: "text-sky-300" },
};

// One dismissible insight, openGym-style: tag, headline, a line of context and an optional action.
export function InsightCard({
  insight,
  onDismiss,
  go,
}: {
  insight: Insight;
  onDismiss: () => void;
  go: (t: Tab) => void;
}) {
  const tone = TONE[insight.tone];
  return (
    <section className="flex items-start gap-3 rounded-2xl bg-surface p-4 ring-1 ring-white/5">
      <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${tone.icon}`} aria-hidden="true">
        {insight.tone === "good" ? "★" : insight.tone === "warn" ? "!" : "i"}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-xs ${tone.chip}`}>{insight.tag}</p>
        <p className="text-lg font-semibold leading-snug text-slate-100">{insight.title}</p>
        {insight.body && <p className="mt-0.5 text-sm text-slate-400">{insight.body}</p>}
        {insight.action && (
          <button
            type="button"
            onClick={() => go(insight.action!.tab)}
            className="mt-2 text-sm font-medium text-accent hover:brightness-110"
          >
            {insight.action.label} ›
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-raised hover:text-slate-200"
      >
        ✕
      </button>
    </section>
  );
}

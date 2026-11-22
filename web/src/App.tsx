import { useEffect, useState } from "react";
import { useHealthData } from "./hooks/useHealthData.ts";
import { RefreshButton } from "./components/RefreshButton.tsx";
import { SettingsPanel } from "./components/SettingsPanel.tsx";
import { TabBar, type Tab } from "./components/TabBar.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { PlanPage } from "./pages/PlanPage.tsx";
import { CoachPage } from "./pages/CoachPage.tsx";
import { StatsPage } from "./pages/StatsPage.tsx";

const TITLES: Record<Tab, string> = {
  home: "Health 360",
  plan: "Plan",
  coach: "Coach",
  stats: "Stats",
};
const SUBTITLES: Partial<Record<Tab, string>> = {
  plan: "What the coach asked for",
  coach: "Today's run",
  stats: "Progress & history",
};

// The tab lives in the URL hash so the browser back button and a reload keep your place.
function tabFromHash(): Tab {
  const h = window.location.hash.replace("#/", "");
  return h === "plan" || h === "coach" || h === "stats" ? h : "home";
}

export default function App() {
  const { data, loading, error, refetch } = useHealthData();
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (t: Tab) => {
    window.location.hash = t === "home" ? "" : `#/${t}`;
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl px-4 pb-28 pt-6">
      <header className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-100">{TITLES[tab]}</h1>
          <p className="text-sm text-slate-500">
            {SUBTITLES[tab] ??
              new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <RefreshButton onRefreshed={refetch} />
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            title="Goals & scoring"
            aria-label="Settings"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-base text-slate-300 ring-1 ring-white/10 transition hover:text-white"
          >
            ⚙️
          </button>
        </div>
      </header>

      {showSettings && data && (
        <SettingsPanel goals={data.goals} onClose={() => setShowSettings(false)} onSaved={refetch} />
      )}

      {loading && <Skeleton />}

      {error && (
        <div className="rounded-xl bg-rose-950/50 p-4 text-sm text-rose-300 ring-1 ring-rose-500/30">
          <p className="font-semibold">Couldn't load data</p>
          <p className="mt-1 text-rose-400/80">{error}</p>
          <p className="mt-2 text-xs text-rose-400/60">
            Check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in web/.env.local and that the
            migration + RLS policies are applied.
          </p>
        </div>
      )}

      {data && (
        <>
          {tab === "home" && <HomePage data={data} go={go} />}
          {tab === "plan" && <PlanPage data={data} />}
          {tab === "coach" && <CoachPage data={data} onChanged={refetch} />}
          {tab === "stats" && <StatsPage data={data} />}
        </>
      )}

      <TabBar tab={tab} onChange={go} />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-40 animate-pulse rounded-2xl bg-surface" />
      ))}
    </div>
  );
}

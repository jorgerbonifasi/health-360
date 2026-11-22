export type Tab = "home" | "plan" | "coach" | "stats";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { id: "plan", label: "Plan", icon: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" },
  { id: "coach", label: "Coach", icon: "M13 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM9 21l2-6-3-2 2-5 4 2 3 1M11 15l4 2 1 4" },
  { id: "stats", label: "Stats", icon: "M5 20V10M12 20V4M19 20v-7" },
];

// Fixed bottom navigation, openGym-style: icon over label, lime when active.
export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      aria-label="Main"
      className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-canvas/95 backdrop-blur"
    >
      <ul className="mx-auto flex max-w-2xl">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <li key={t.id} className="flex-1">
              <button
                type="button"
                onClick={() => onChange(t.id)}
                aria-current={active ? "page" : undefined}
                className={`flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                  active ? "text-accent" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={t.icon} />
                </svg>
                {t.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

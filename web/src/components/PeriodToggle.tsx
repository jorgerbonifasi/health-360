import type { Period } from "../lib/metrics.ts";

// Segmented Week | Month control that drives the whole dashboard's aggregation + comparisons.
export function PeriodToggle({
  period,
  onChange,
}: {
  period: Period;
  onChange: (p: Period) => void;
}) {
  const options: { value: Period; label: string }[] = [
    { value: "day", label: "Day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
  ];
  return (
    <div className="inline-flex rounded-lg bg-slate-800 p-0.5 ring-1 ring-white/10">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition ${
            period === o.value ? "bg-slate-600 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

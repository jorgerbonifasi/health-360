import { useState } from "react";
import { supabase } from "../lib/supabase.ts";
import type { Goal } from "../lib/types.ts";
import { goalDirection, goalValue, toDisplayWeight, WEIGHT_UNIT } from "../lib/metrics.ts";

const KG_PER_LB = 1 / 2.2046226218;

function Field({
  label,
  value,
  onChange,
  suffix,
  step = "1",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  step?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-slate-300">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 rounded-lg bg-slate-900 px-2 py-1 text-right text-sm text-slate-100 ring-1 ring-white/10 focus:outline-none focus:ring-blue-500"
        />
        {suffix && <span className="w-8 text-xs text-slate-500">{suffix}</span>}
      </span>
    </label>
  );
}

// Edit tunable goals + pillar weights. Weight is entered in the display unit (lb) and stored as
// kg; pillar weights are entered as % and stored as decimals. Persists via the update-goals
// Edge Function (anon key), then refetches.
export function SettingsPanel({
  goals,
  onClose,
  onSaved,
}: {
  goals: Goal[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [stepGoal, setStepGoal] = useState(String(goalValue(goals, "daily_step_goal", 10000)));
  const [hours, setHours] = useState(String(goalValue(goals, "weekly_active_hours_goal", 5)));
  const [runKm, setRunKm] = useState(String(goalValue(goals, "weekly_running_km_goal", 40)));
  const [weight, setWeight] = useState(
    String(Math.round(toDisplayWeight(goalValue(goals, "target_weight", 75)))),
  );
  const [dir, setDir] = useState<"down" | "up">(goalDirection(goals, "target_weight"));
  const pctInit = (m: string, f: number) => String(Math.round(goalValue(goals, m, f) * 100));
  const [wMove, setWMove] = useState(pctInit("pillar_weight_movement", 0.4));
  const [wEx, setWEx] = useState(pctInit("pillar_weight_exercise", 0.4));
  const [wWt, setWWt] = useState(pctInit("pillar_weight_weight", 0.2));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weightSum = Number(wMove) + Number(wEx) + Number(wWt);

  const save = async () => {
    setSaving(true);
    setError(null);
    const n = (s: string) => Number(s);
    const updates = [
      { metric: "daily_step_goal", target_value: Math.round(n(stepGoal)) },
      { metric: "weekly_active_hours_goal", target_value: n(hours) },
      { metric: "weekly_running_km_goal", target_value: n(runKm) },
      { metric: "target_weight", target_value: Math.round(n(weight) * KG_PER_LB * 10) / 10, direction: dir },
      { metric: "pillar_weight_movement", target_value: n(wMove) / 100 },
      { metric: "pillar_weight_exercise", target_value: n(wEx) / 100 },
      { metric: "pillar_weight_weight", target_value: n(wWt) / 100 },
    ];
    try {
      const res = await supabase.functions.invoke("update-goals", { body: { updates } });
      if (res.error) throw res.error;
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-slate-800 p-5 ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-semibold text-slate-100">Goals & scoring</h2>

        <div className="divide-y divide-white/5">
          <Field label="Daily step goal" value={stepGoal} onChange={setStepGoal} suffix="steps" step="500" />
          <Field label="Weekly active hours" value={hours} onChange={setHours} suffix="h" step="0.5" />
          <Field label="Weekly running goal" value={runKm} onChange={setRunKm} suffix="km" step="1" />

          <label className="flex items-center justify-between gap-3 py-2">
            <span className="text-sm text-slate-300">Target weight</span>
            <span className="flex items-center gap-1">
              <input
                type="number"
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-24 rounded-lg bg-slate-900 px-2 py-1 text-right text-sm text-slate-100 ring-1 ring-white/10 focus:outline-none focus:ring-blue-500"
              />
              <span className="w-8 text-xs text-slate-500">{WEIGHT_UNIT}</span>
            </span>
          </label>
          <label className="flex items-center justify-between gap-3 py-2">
            <span className="text-sm text-slate-300">Weight goal direction</span>
            <select
              value={dir}
              onChange={(e) => setDir(e.target.value as "down" | "up")}
              className="rounded-lg bg-slate-900 px-2 py-1 text-sm text-slate-100 ring-1 ring-white/10 focus:outline-none focus:ring-blue-500"
            >
              <option value="down">trending down</option>
              <option value="up">trending up</option>
            </select>
          </label>
        </div>

        <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Pillar weights
        </h3>
        <div className="divide-y divide-white/5">
          <Field label="Movement" value={wMove} onChange={setWMove} suffix="%" />
          <Field label="Exercise" value={wEx} onChange={setWEx} suffix="%" />
          <Field label="Weight" value={wWt} onChange={setWWt} suffix="%" />
        </div>
        <p className={`mt-1 text-[11px] ${weightSum === 100 ? "text-slate-500" : "text-amber-400"}`}>
          {weightSum === 100
            ? "Weights sum to 100%."
            : `Weights sum to ${weightSum}% — they're normalized automatically, so this is fine.`}
        </p>

        {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-slate-700 py-2 text-sm text-slate-200 hover:bg-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// A small ▲/▼ change badge for period-over-period comparisons.
// `value` is the signed change; `unit` picks the formatting; `goodWhen` decides the color
// (e.g. steps are good when up, weight is good when down).
export function Delta({
  value,
  unit,
  goodWhen,
  suffix,
}: {
  value: number | null;
  unit: "%" | "kg" | "lb";
  goodWhen: "up" | "down";
  suffix?: string;
}) {
  if (value === null || !isFinite(value)) {
    return <span className="text-xs text-slate-500">— {suffix}</span>;
  }
  const flat = Math.abs(value) < (unit === "%" ? 0.5 : 0.1);
  const up = value > 0;
  const good = flat ? null : goodWhen === "up" ? up : !up;
  const color = good === null ? "text-slate-400" : good ? "text-emerald-400" : "text-rose-400";
  const arrow = flat ? "→" : up ? "▲" : "▼";
  const mag = unit === "%" ? `${Math.abs(Math.round(value))}%` : `${Math.abs(value).toFixed(1)} ${unit}`;
  return (
    <span className={`text-xs ${color}`}>
      {arrow} {mag}
      {suffix ? <span className="text-slate-500"> {suffix}</span> : null}
    </span>
  );
}

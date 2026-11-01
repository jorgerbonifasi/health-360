// Shared helpers for the AI coach (run-plan writes the prescription, run-review grades it).

export function paceMinKm(distanceM: number, movingS: number): number | null {
  const km = distanceM / 1000;
  return km > 0 ? movingS / 60 / km : null;
}

// Decimal minutes per km -> "5:30/km".
export function fmtPace(minKm: number | null | undefined, suffix = "/km"): string {
  if (minKm == null || !isFinite(minKm)) return "—";
  const m = Math.floor(minKm);
  const s = Math.round((minKm - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}${suffix}`;
}

export function fmtPaceRange(low: number | null, high: number | null): string {
  if (low == null && high == null) return "—";
  if (low == null || high == null) return fmtPace(low ?? high);
  if (Math.abs(low - high) < 0.01) return fmtPace(low);
  return `${fmtPace(low, "")}–${fmtPace(high)}`;
}

export function fmtDur(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h${m}m` : `${m}m`;
}

export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// The six-line card text, rendered from the structured fields so the prose and the stored
// numbers can never drift apart.
export function renderPlanText(p: {
  workout_type: string;
  distance_km: number | null;
  pace_min_km_low: number | null;
  pace_min_km_high: number | null;
  hr_low: number | null;
  hr_high: number | null;
  why: string;
  reminder: string;
}): string {
  const hr = p.hr_low != null && p.hr_high != null
    ? `${p.hr_low}–${p.hr_high} bpm`
    : p.hr_low != null || p.hr_high != null
    ? `${p.hr_low ?? p.hr_high} bpm`
    : "—";
  return [
    `Workout: ${p.workout_type}`,
    `Distance: ${p.distance_km != null ? `${p.distance_km} km` : "—"}`,
    `Target pace: ${fmtPaceRange(p.pace_min_km_low, p.pace_min_km_high)}`,
    `Target HR: ${hr}`,
    `Why: ${p.why}`,
    `Reminder: ${p.reminder}`,
  ].join("\n");
}

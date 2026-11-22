import type { HealthData } from "../hooks/useHealthData.ts";
import { RunPlanCard } from "../components/RunPlanCard.tsx";

export function CoachPage({ data, onChanged }: { data: HealthData; onChanged: () => void | Promise<void> }) {
  return <RunPlanCard plans={data.runPlans} onChanged={onChanged} />;
}

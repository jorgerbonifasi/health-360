import type { HealthData } from "../hooks/useHealthData.ts";
import type { Tab } from "../components/TabBar.tsx";
import { StaleBanner } from "../components/StaleBanner.tsx";
import { WeekStrip } from "../components/WeekStrip.tsx";
import { TodayCard } from "../components/TodayCard.tsx";
import { ScoreTile } from "../components/ScoreTile.tsx";
import { LastSynced } from "../components/LastSynced.tsx";
import { BodyWeightCard } from "../components/BodyWeightCard.tsx";
import { StreakCard } from "../components/StreakCard.tsx";

export function HomePage({ data, go }: { data: HealthData; go: (t: Tab) => void }) {
  const goal = data.goals.find((g) => g.metric === "weekly_running_km_goal");
  return (
    <div className="space-y-4">
      <StaleBanner steps={data.steps} weights={data.weights} />
      <WeekStrip
        activities={data.activities}
        plans={data.runPlans}
        weeklyKmGoal={goal ? Number(goal.target_value) : null}
      />
      <TodayCard plans={data.runPlans} activities={data.activities} onOpenCoach={() => go("coach")} />
      <BodyWeightCard weights={data.weights} goals={data.goals} showRanges={false} />
      <StreakCard activities={data.activities} compact />
      <ScoreTile scores={data.scores} onOpen={() => go("stats")} />
      <LastSynced
        activities={data.activities}
        weights={data.weights}
        steps={data.steps}
        scores={data.scores}
      />
    </div>
  );
}

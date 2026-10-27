import type { Dashboard } from "../server/service";
import { ComingUp } from "./coming-up";
import { NeedsALook } from "./needs-a-look";
import { DietCard, SpendingCard } from "./lower-cards";
import { SummaryTiles } from "./summary-tiles";
import { TodayDoses } from "./today-doses";
import { MainColumn, PageGrid, SideColumn } from "@/components/ui/page-shell";

type Props = {
  dashboard: Dashboard;
  timezone: string;
  showAnimal?: boolean;
  // Show Given/Skipped on today's doses. Convenience only: the dose service enforces roles.
  canWrite?: boolean;
};

// The dashboard body, shared by the household home page and each animal's overview. The page
// supplies the heading and (on the home page) the animal header. Today comes first in the DOM,
// so it is also first on mobile.
export function DashboardView({ dashboard, timezone, showAnimal = true, canWrite = false }: Props) {
  return (
    <div className="space-y-section @container">
      <SummaryTiles dashboard={dashboard} />
      <PageGrid>
        <MainColumn>
          <TodayDoses
            dashboard={dashboard}
            timezone={timezone}
            showAnimal={showAnimal}
            canWrite={canWrite}
          />
          <ComingUp dashboard={dashboard} timezone={timezone} showAnimal={showAnimal} />
        </MainColumn>
        <SideColumn>
          <NeedsALook dashboard={dashboard} timezone={timezone} showAnimal={showAnimal} />
          <DietCard dashboard={dashboard} timezone={timezone} showAnimal={showAnimal} />
          <SpendingCard dashboard={dashboard} />
        </SideColumn>
      </PageGrid>
    </div>
  );
}

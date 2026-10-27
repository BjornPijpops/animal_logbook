import { AlertCircle, CheckCircle2, Syringe } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Dashboard } from "../server/service";
import { MoreLink } from "./more-link";
import { RelativeDate } from "./relative-date";
import { useDashboardFormat } from "./use-dashboard-format";

const SHOWN = 5;
// The missed-dose query is capped at this many rows, so a full page means "at least".
export const MISSED_QUERY_LIMIT = 20;

// Passed vaccination dates (as entered by the user) and missed doses (a count with a link).
// Wording is factual; nothing here advises or judges.
export function NeedsALook({
  dashboard,
  timezone,
  showAnimal,
}: {
  dashboard: Dashboard;
  timezone: string;
  showAnimal: boolean;
}) {
  const t = useTranslations("dashboard");
  const f = useDashboardFormat(timezone, dashboard.today, showAnimal);
  const vaccinations = dashboard.overdueVaccinations;
  const shown = vaccinations.items.slice(0, SHOWN);
  const missed = dashboard.medications.missed.length;
  const query = dashboard.animalId ? `?animal=${dashboard.animalId}` : "";

  return (
    <Card variant="raised" role="region" aria-labelledby="dash-needs">
      <CardHeader>
        <SectionHeader id="dash-needs" title={t("needs.title")} description={t("needs.window")} />
      </CardHeader>
      <CardBody className="space-y-4">
        <section aria-labelledby="dash-vaccinations">
          <SectionHeader
            id="dash-vaccinations"
            level={3}
            title={t("vaccinations.title")}
            description={t("vaccinations.note")}
          />
          {shown.length === 0 ? (
            <EmptyState icon={CheckCircle2} title={t("vaccinations.empty")} />
          ) : (
            <ul className="divide-line divide-y">
              {shown.map((v) => (
                <ListRow
                  key={v.id}
                  icon={Syringe}
                  tone="attention"
                  title={v.title}
                  href={`/health/${v.id}`}
                  subtitle={t("vaccinations.dueOn", {
                    date: f.day(v.nextDueOn),
                    ...f.animal(v.animalName),
                  })}
                  meta={
                    <span className="flex flex-col items-end gap-1">
                      <RelativeDate
                        date={v.nextDueOn}
                        today={dashboard.today}
                        timezone={timezone}
                      />
                      <StatusBadge tone="attention" label={t("vaccinations.badge")} />
                    </span>
                  }
                />
              ))}
            </ul>
          )}
          <MoreLink
            href={`/timeline${query}`}
            count={vaccinations.items.length - shown.length}
            exact={!vaccinations.more}
          />
        </section>
        <section aria-labelledby="dash-missed">
          <SectionHeader id="dash-missed" level={3} title={t("missed.title")} />
          {missed === 0 ? (
            <EmptyState icon={CheckCircle2} title={t("missed.empty")} />
          ) : (
            <ul>
              <ListRow
                icon={AlertCircle}
                tone="attention"
                title={t("missed.summary", {
                  count: missed,
                  atLeast: missed >= MISSED_QUERY_LIMIT ? "yes" : "no",
                })}
                href="/medications"
                meta={<StatusBadge tone="attention" label={t("missed.badge")} />}
              />
            </ul>
          )}
        </section>
      </CardBody>
    </Card>
  );
}

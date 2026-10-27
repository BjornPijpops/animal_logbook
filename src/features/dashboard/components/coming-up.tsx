import { CalendarClock, FileText, Pill, Repeat } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { SectionHeader } from "@/components/ui/section-header";
import { COMING_UP_LIMIT, comingUpMoreHref, type ComingUpItem } from "../server/coming-up";
import type { Dashboard } from "../server/service";
import { MoreLink } from "./more-link";
import { RelativeDate } from "./relative-date";
import { useDashboardFormat } from "./use-dashboard-format";

const icons = {
  appointment: CalendarClock,
  followUp: Repeat,
  document: FileText,
  medicationEnd: Pill,
} as const;

export function ComingUp({
  dashboard,
  timezone,
  showAnimal,
}: {
  dashboard: Dashboard;
  timezone: string;
  showAnimal: boolean;
}) {
  const t = useTranslations("dashboard.comingUp");
  const f = useDashboardFormat(timezone, dashboard.today, showAnimal);
  const { items, more } = dashboard.comingUp;
  const shown = items.slice(0, COMING_UP_LIMIT);
  const hidden = items.slice(COMING_UP_LIMIT);

  const subtitle = (item: ComingUpItem) =>
    t(item.kind, { ...f.animal(item.animalName), time: item.at ? f.time(item.at) : "" });

  return (
    <Card variant="raised" role="region" aria-labelledby="dash-coming-up">
      <CardHeader>
        <SectionHeader id="dash-coming-up" title={t("title")} description={t("window")} />
      </CardHeader>
      <CardBody>
        {shown.length === 0 ? (
          <EmptyState icon={CalendarClock} title={t("empty")} />
        ) : (
          <ul className="divide-line divide-y">
            {shown.map((item) => (
              <ListRow
                key={item.key}
                icon={icons[item.kind]}
                title={
                  item.kind === "followUp" ? t("followUpTitle", { title: item.title }) : item.title
                }
                href={item.href}
                subtitle={subtitle(item)}
                meta={
                  <RelativeDate
                    date={item.date}
                    today={dashboard.today}
                    timezone={timezone}
                    at={item.at}
                  />
                }
              />
            ))}
          </ul>
        )}
      </CardBody>
      {hidden.length > 0 || more ? (
        <CardFooter>
          <MoreLink
            href={comingUpMoreHref(hidden, dashboard.animalId)}
            count={hidden.length}
            exact={!more}
          />
        </CardFooter>
      ) : null}
    </Card>
  );
}

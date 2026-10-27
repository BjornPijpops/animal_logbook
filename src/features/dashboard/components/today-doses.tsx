import { CheckCircle2, Pill } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { DoseButtons } from "@/features/medications/components/dose-buttons";
import { DoseLiveRegion } from "@/features/medications/components/dose-live-region";
import Link from "next/link";
import type { Dashboard } from "../server/service";
import { useDashboardFormat } from "./use-dashboard-format";

// Doses due today. Given/Skipped only render when `canWrite`; the dose service stays the
// authority (viewers are refused there too) and logging is idempotent per scheduled slot.
export function TodayDoses({
  dashboard,
  timezone,
  showAnimal,
  canWrite,
}: {
  dashboard: Dashboard;
  timezone: string;
  showAnimal: boolean;
  canWrite: boolean;
}) {
  const t = useTranslations("dashboard.today");
  const f = useDashboardFormat(timezone, dashboard.today, showAnimal);
  const { dueToday, dueMore } = dashboard.medications;

  return (
    <Card
      variant="raised"
      role="region"
      aria-labelledby="dash-today"
      className="ring-primary/30 ring-1"
    >
      <CardHeader>
        <SectionHeader id="dash-today" title={t("title")} description={t("window")} />
      </CardHeader>
      <CardBody>
        {canWrite ? <DoseLiveRegion /> : null}
        {dueToday.length === 0 ? (
          <EmptyState icon={CheckCircle2} title={t("empty")}>
            {t("emptyHint")}
          </EmptyState>
        ) : (
          <ul className="divide-line divide-y">
            {dueToday.map((dose) => {
              const time = f.time(dose.scheduledAt);
              return (
                <ListRow
                  key={`${dose.medicationId}-${dose.scheduledAt.toISOString()}`}
                  icon={Pill}
                  title={dose.dosage ? `${dose.name} ${dose.dosage}` : dose.name}
                  href={`/medications/${dose.medicationId}`}
                  subtitle={showAnimal ? dose.animalName : undefined}
                  meta={
                    <span className="flex flex-col items-end gap-1">
                      <time
                        dateTime={dose.scheduledAt.toISOString()}
                        className="text-foreground font-medium"
                      >
                        {time}
                      </time>
                      {dose.late ? <StatusBadge tone="attention" label={t("late")} /> : null}
                    </span>
                  }
                  actions={
                    canWrite ? (
                      <DoseButtons
                        medicationId={dose.medicationId}
                        scheduledAt={dose.scheduledAt.toISOString()}
                        label={[dose.name, showAnimal ? dose.animalName : null, time]
                          .filter(Boolean)
                          .join(", ")}
                      />
                    ) : undefined
                  }
                />
              );
            })}
          </ul>
        )}
      </CardBody>
      {dueMore ? (
        <CardFooter>
          <Link
            href="/medications"
            className="text-primary inline-flex min-h-11 items-center font-medium underline"
          >
            {t("moreLink")}
          </Link>
        </CardFooter>
      ) : null}
    </Card>
  );
}

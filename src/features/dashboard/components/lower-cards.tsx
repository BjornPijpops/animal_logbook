import { Utensils, Wallet } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { SectionHeader } from "@/components/ui/section-header";
import { formatMoney } from "@/lib/money";
import type { Dashboard } from "../server/service";
import { useDashboardFormat } from "./use-dashboard-format";

const footerLink = "text-primary inline-flex min-h-11 items-center font-medium underline";

// Lower-prominence cards: spending detail and recent diet changes.
export function SpendingCard({ dashboard }: { dashboard: Dashboard }) {
  const t = useTranslations("dashboard.spending");
  const totals = dashboard.spending.totals;
  return (
    <Card variant="raised" role="region" aria-labelledby="dash-spending">
      <CardHeader>
        <SectionHeader id="dash-spending" title={t("title")} />
      </CardHeader>
      <CardBody>
        {totals.length === 0 ? (
          <EmptyState icon={Wallet} title={t("empty")} />
        ) : (
          <ul className="divide-line divide-y">
            {totals.map((row) => (
              <ListRow
                key={row.currency}
                icon={Wallet}
                title={formatMoney(row.totalMinor, row.currency, "en")}
                subtitle={row.currency}
              />
            ))}
          </ul>
        )}
      </CardBody>
      <CardFooter>
        <Link href="/expenses" className={footerLink}>
          {t("link")}
        </Link>
      </CardFooter>
    </Card>
  );
}

export function DietCard({
  dashboard,
  timezone,
  showAnimal,
}: {
  dashboard: Dashboard;
  timezone: string;
  showAnimal: boolean;
}) {
  const t = useTranslations("dashboard.diet");
  const f = useDashboardFormat(timezone, dashboard.today, showAnimal);
  const items = dashboard.dietChanges.items;
  return (
    <Card variant="raised" role="region" aria-labelledby="dash-diet">
      <CardHeader>
        <SectionHeader id="dash-diet" title={t("title")} description={t("window")} />
      </CardHeader>
      <CardBody>
        {items.length === 0 ? (
          <EmptyState icon={Utensils} title={t("empty")} />
        ) : (
          <ul className="divide-line divide-y">
            {items.map((c) => (
              <ListRow
                key={`${c.planId}-${c.kind}`}
                icon={Utensils}
                title={c.label}
                href={`/food/${c.planId}`}
                subtitle={t(c.kind === "started" ? "started" : "ended", {
                  date: f.day(c.date),
                  ...f.animal(c.animalName),
                })}
              />
            ))}
          </ul>
        )}
      </CardBody>
      <CardFooter>
        <Link href="/food/history" className={footerLink}>
          {t("link")}
        </Link>
      </CardFooter>
    </Card>
  );
}

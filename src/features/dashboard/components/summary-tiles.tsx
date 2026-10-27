import { CalendarClock, ClipboardList, Pill, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatTile } from "@/components/ui/stat-tile";
import { formatMoney } from "@/lib/money";
import type { Dashboard } from "../server/service";

const count = (n: number, more: boolean) => `${n}${more ? "+" : ""}`;

// Counts come from lists the dashboard already loaded; "+" marks a list that was cut off.
export function SummaryTiles({ dashboard }: { dashboard: Dashboard }) {
  const t = useTranslations("dashboard.tiles");
  const { medications, overdueVaccinations, appointments, followUps, spending } = dashboard;
  const query = dashboard.animalId ? `?animal=${dashboard.animalId}` : "";
  return (
    <section aria-label={t("label")}>
      <ul className="grid grid-cols-1 gap-3 @lg:grid-cols-2 @4xl:grid-cols-4">
        <li>
          <StatTile
            icon={Pill}
            label={t("dosesToday")}
            value={count(medications.dueToday.length, medications.dueMore)}
            hint={t("dosesHint")}
            href="/medications"
            className="h-full"
          />
        </li>
        <li>
          <StatTile
            icon={ClipboardList}
            tone={overdueVaccinations.items.length > 0 ? "attention" : "neutral"}
            label={t("vaccinations")}
            value={count(overdueVaccinations.items.length, overdueVaccinations.more)}
            hint={t("vaccinationsHint")}
            href={`/timeline${query}`}
            className="h-full"
          />
        </li>
        <li>
          <StatTile
            icon={CalendarClock}
            label={t("upcoming")}
            value={count(
              appointments.items.length + followUps.items.length,
              appointments.more || followUps.more,
            )}
            hint={t("upcomingHint")}
            href={`/timeline${query}`}
            className="h-full"
          />
        </li>
        <li>
          <StatTile
            icon={Wallet}
            label={t("spending")}
            value={
              spending.totals.length === 0
                ? t("spendingNone")
                : spending.totals.map((row) => (
                    <span key={row.currency} className="block">
                      {formatMoney(row.totalMinor, row.currency, "en")}
                    </span>
                  ))
            }
            hint={t("spendingHint")}
            href="/expenses"
            className="h-full"
          />
        </li>
      </ul>
    </section>
  );
}

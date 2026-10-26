import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import type { Dashboard } from "../server/service";

type Props = { dashboard: Dashboard; timezone: string; showAnimal?: boolean };

const dateOnly = (value: string) => new Date(`${value}T12:00:00Z`);

export async function DashboardView({ dashboard, timezone, showAnimal = true }: Props) {
  const t = await getTranslations("dashboard");
  const format = await getFormatter();
  const day = (value: string) =>
    format.dateTime(dateOnly(value), { dateStyle: "medium", timeZone: "UTC" });
  const when = (value: Date) =>
    format.dateTime(value, { dateStyle: "medium", timeStyle: "short", timeZone: timezone });
  const time = (value: Date) => format.dateTime(value, { timeStyle: "short", timeZone: timezone });
  const who = (name: string | null) => (showAnimal && name ? ` · ${name}` : "");
  const linkClass = "hover:underline focus-visible:underline";
  const moreLink = (href: string, more: boolean) =>
    more ? (
      <Link href={href} className="text-primary text-sm underline">
        {t("seeAll")}
      </Link>
    ) : null;
  const meds = dashboard.medications;
  const spendingEmpty = dashboard.spending.totals.length === 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card role="region" aria-labelledby="dash-upcoming">
        <h2 id="dash-upcoming" className="text-lg font-semibold">
          {t("upcoming.title")}
        </h2>
        <p className="text-muted-foreground text-xs">{t("upcoming.window")}</p>
        {dashboard.appointments.items.length === 0 && dashboard.followUps.items.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">{t("upcoming.empty")}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {dashboard.appointments.items.map((a) => (
              <li key={a.id}>
                <Link href={`/appointments/${a.id}`} className={linkClass}>
                  {a.title}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {when(a.scheduledAt)}
                  {who(a.animalName)}
                </span>
              </li>
            ))}
            {dashboard.followUps.items.map((f) => (
              <li key={`f-${f.appointmentId}`}>
                <Link href={`/appointments/${f.appointmentId}`} className={linkClass}>
                  {t("upcoming.followUp", { title: f.title })}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {day(f.followUpDate)}
                  {who(f.animalName)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {moreLink("/timeline", dashboard.appointments.more || dashboard.followUps.more)}
      </Card>

      <Card role="region" aria-labelledby="dash-vaccinations">
        <h2 id="dash-vaccinations" className="text-lg font-semibold">
          {t("vaccinations.title")}
        </h2>
        <p className="text-muted-foreground text-xs">{t("vaccinations.note")}</p>
        {dashboard.overdueVaccinations.items.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">{t("vaccinations.empty")}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {dashboard.overdueVaccinations.items.map((v) => (
              <li key={v.id}>
                <Link href={`/health/${v.id}`} className={linkClass}>
                  {v.title}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {t("vaccinations.dueOn", { date: day(v.nextDueOn) })}
                  {who(v.animalName)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {moreLink("/timeline", dashboard.overdueVaccinations.more)}
      </Card>

      <Card role="region" aria-labelledby="dash-medications">
        <h2 id="dash-medications" className="text-lg font-semibold">
          {t("medications.title")}
        </h2>
        <h3 className="mt-2 text-sm font-medium">{t("medications.dueToday")}</h3>
        {meds.dueToday.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("medications.dueEmpty")}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {meds.dueToday.map((d) => (
              <li key={`${d.medicationId}-${d.scheduledAt.toISOString()}`}>
                <Link href={`/medications/${d.medicationId}`} className={linkClass}>
                  {d.name}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {time(d.scheduledAt)}
                  {d.dosage ? ` · ${d.dosage}` : ""}
                  {who(d.animalName)}
                  {d.late ? ` · ${t("medications.late")}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <h3 className="mt-3 text-sm font-medium">{t("medications.missed")}</h3>
        {meds.missed.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("medications.missedEmpty")}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {meds.missed.map((m) => (
              <li key={`${m.medicationId}-${m.scheduledAt.toISOString()}`}>
                <Link href={`/medications/${m.medicationId}`} className={linkClass}>
                  {m.name}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {when(m.scheduledAt)}
                  {who(m.animalName)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <h3 className="mt-3 text-sm font-medium">{t("medications.ending")}</h3>
        {meds.ending.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("medications.endingEmpty")}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {meds.ending.map((m) => (
              <li key={m.medicationId}>
                <Link href={`/medications/${m.medicationId}`} className={linkClass}>
                  {m.name}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {t("medications.endsOn", { date: day(m.endedOn) })}
                  {who(m.animalName)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/medications" className="text-primary mt-2 inline-block text-sm underline">
          {t("medications.link")}
        </Link>
      </Card>

      <Card role="region" aria-labelledby="dash-documents">
        <h2 id="dash-documents" className="text-lg font-semibold">
          {t("documents.title")}
        </h2>
        <p className="text-muted-foreground text-xs">{t("documents.window")}</p>
        {dashboard.documents.items.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">{t("documents.empty")}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {dashboard.documents.items.map((d) => (
              <li key={d.id}>
                <Link href={`/documents/${d.id}`} className={linkClass}>
                  {d.title}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {t("documents.expiresOn", { date: day(d.expiresOn) })}
                  {who(d.animalName)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {moreLink("/documents", dashboard.documents.more)}
      </Card>

      <Card role="region" aria-labelledby="dash-spending">
        <h2 id="dash-spending" className="text-lg font-semibold">
          {t("spending.title")}
        </h2>
        {spendingEmpty ? (
          <p className="text-muted-foreground mt-2 text-sm">{t("spending.empty")}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {dashboard.spending.totals.map((row) => (
              <li key={row.currency} className="font-medium">
                {formatMoney(row.totalMinor, row.currency, "en")}
              </li>
            ))}
          </ul>
        )}
        <Link href="/expenses" className="text-primary mt-2 inline-block text-sm underline">
          {t("spending.link")}
        </Link>
      </Card>

      <Card role="region" aria-labelledby="dash-diet">
        <h2 id="dash-diet" className="text-lg font-semibold">
          {t("diet.title")}
        </h2>
        <p className="text-muted-foreground text-xs">{t("diet.window")}</p>
        {dashboard.dietChanges.items.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">{t("diet.empty")}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {dashboard.dietChanges.items.map((c) => (
              <li key={`${c.planId}-${c.kind}`}>
                <Link href={`/food/${c.planId}`} className={linkClass}>
                  {c.label}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {t(c.kind === "started" ? "diet.started" : "diet.ended", { date: day(c.date) })}
                  {who(c.animalName)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/food/history" className="text-primary mt-2 inline-block text-sm underline">
          {t("diet.link")}
        </Link>
      </Card>
    </div>
  );
}

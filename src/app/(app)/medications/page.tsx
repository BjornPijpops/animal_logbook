import { Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { can, requireHouseholdAccess } from "@/features/households";
import {
  DoseButtons,
  getMedicationDeps,
  listDeletedMedications,
  listDueDoses,
  listMedications,
  RestoreMedicationButton,
} from "@/features/medications";

export default async function MedicationsPage() {
  const { ctx } = await requireHouseholdAccess();
  const t = await getTranslations("medications");
  const format = await getFormatter();
  const deps = getMedicationDeps();
  const canWrite = can(ctx.role, "data:write");
  const [list, due, deleted] = await Promise.all([
    listMedications(deps, ctx),
    listDueDoses(deps, ctx),
    canWrite ? listDeletedMedications(deps, ctx) : null,
  ]);
  if (!list.ok || !due.ok) notFound();
  const when = (date: Date) =>
    format.dateTime(date, { dateStyle: "medium", timeStyle: "short", timeZone: ctx.timezone });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {canWrite ? (
          <Link href="/medications/new" className={buttonVariants()}>
            <Plus aria-hidden="true" className="size-4" />
            {t("add")}
          </Link>
        ) : null}
      </div>
      <p className="text-muted-foreground text-sm">{t("disclaimer")}</p>

      <section aria-labelledby="due-heading" className="space-y-3">
        <h2 id="due-heading" className="text-lg font-semibold">
          {t("dueTitle")}
        </h2>
        {due.value.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("dueEmpty")}</p>
        ) : (
          <ul className="space-y-3">
            {due.value.map((dose) => {
              const label = `${dose.name} · ${dose.animalName} · ${when(dose.scheduledAt)}`;
              return (
                <li key={`${dose.medicationId}-${dose.scheduledAt.toISOString()}`}>
                  <Card className="space-y-2">
                    <p className="font-medium break-words">
                      {dose.name} · {dose.animalName}
                    </p>
                    <p className="text-sm">
                      {dose.dosage} · {when(dose.scheduledAt)}
                      {dose.late ? ` · ${t("late")}` : ""}
                    </p>
                    {canWrite ? (
                      <DoseButtons
                        medicationId={dose.medicationId}
                        scheduledAt={dose.scheduledAt.toISOString()}
                        label={label}
                      />
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="all-heading" className="space-y-3">
        <h2 id="all-heading" className="text-lg font-semibold">
          {t("listTitle")}
        </h2>
        {list.value.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ul className="space-y-3">
            {list.value.map((m) => (
              <li key={m.id}>
                <Card>
                  <Link href={`/medications/${m.id}`} className="block space-y-1 underline">
                    <span className="font-medium break-words">{m.name}</span>
                  </Link>
                  <p className="text-sm">
                    {m.animalName} · {m.dosage}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {m.schedule ? t(`kinds.${m.schedule.kind}`) : t("kinds.as_needed")}
                    {m.schedule && m.schedule.times.length > 0
                      ? ` · ${m.schedule.times.join(", ")}`
                      : ""}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {deleted?.ok && deleted.value.length > 0 ? (
        <section aria-labelledby="deleted-heading" className="space-y-3">
          <h2 id="deleted-heading" className="text-lg font-semibold">
            {t("deletedTitle")}
          </h2>
          <ul className="space-y-3">
            {deleted.value.map((m) => (
              <li key={m.id}>
                <Card className="flex items-center justify-between gap-3">
                  <span className="break-words">
                    {m.name} · {m.animalName}
                  </span>
                  <RestoreMedicationButton id={m.id} name={m.name} />
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { getAnimalDeps, listAnimals } from "@/features/animals";
import { can, requireHouseholdAccess } from "@/features/households";
import {
  AdherenceChart,
  AsNeededButton,
  asScheduleKind,
  DeleteMedicationButton,
  getMedication,
  getMedicationDeps,
  MedicationForm,
} from "@/features/medications";

export default async function MedicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireHouseholdAccess();
  const t = await getTranslations("medications");
  const format = await getFormatter();
  const result = await getMedication(getMedicationDeps(), ctx, id);
  if (!result.ok) notFound();
  const { medication, doses, adherence, adherenceDays } = result.value;
  const canWrite = can(ctx.role, "data:write");
  const animals = await listAnimals(getAnimalDeps(), ctx);
  const options = animals.ok ? animals.value.map(({ id: a, name }) => ({ id: a, name })) : [];
  const schedule = medication.schedule;
  const when = (date: Date) =>
    format.dateTime(date, { dateStyle: "medium", timeStyle: "short", timeZone: ctx.timezone });
  const percent = adherence.rate === null ? null : Math.round(adherence.rate * 100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold break-words">{medication.name}</h1>
        <p className="text-muted-foreground text-sm">
          {medication.animalName} · {medication.dosage}
        </p>
        <p className="text-muted-foreground text-sm">{t("disclaimer")}</p>
      </div>

      {(schedule?.kind === "as_needed" || !schedule) && canWrite ? (
        <Card className="space-y-2">
          <p className="text-sm">{t("asNeededHint")}</p>
          <AsNeededButton medicationId={id} />
        </Card>
      ) : null}

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">{t("adherence.title")}</h2>
        <p className="text-sm">
          {t("adherence.summary", {
            given: adherence.given,
            skipped: adherence.skipped,
            missed: adherence.missed,
            days: adherenceDays,
          })}
          {percent === null ? "" : ` ${t("adherence.rate", { percent })}`}
        </p>
        <AdherenceChart days={adherence.days} />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">{t("history")}</h2>
        {doses.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("historyEmpty")}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {doses.map((dose) => (
              <li key={dose.id}>
                {when(dose.scheduledAt)} · {t(`status.${dose.status}`)}
                {dose.loggedByName ? ` · ${t("loggedBy", { name: dose.loggedByName })}` : ""}
                {dose.note ? ` · ${dose.note}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canWrite ? (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">{t("save")}</h2>
          <MedicationForm
            medicationId={id}
            animals={options}
            defaults={{
              animalId: medication.animalId,
              name: medication.name,
              dosage: medication.dosage,
              startedOn: medication.startedOn,
              endedOn: medication.endedOn ?? "",
              notes: medication.notes ?? "",
              kind: asScheduleKind(schedule?.kind ?? "as_needed"),
              times: schedule ? [...schedule.times] : [],
              weekdays: schedule ? [...schedule.weekdays] : [],
              intervalDays: schedule?.intervalDays ?? null,
            }}
          />
        </Card>
      ) : null}

      {canWrite ? (
        <Card>
          <DeleteMedicationButton medicationId={id} />
        </Card>
      ) : null}
      <Link href="/medications" className="text-primary inline-block text-sm underline">
        {t("back")}
      </Link>
    </div>
  );
}

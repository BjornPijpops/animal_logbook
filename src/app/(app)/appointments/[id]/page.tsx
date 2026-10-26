import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { getAnimalDeps, listAnimals } from "@/features/animals";
import {
  AppointmentForm,
  asAppointmentType,
  DeleteAppointmentButton,
  getAppointment,
  getAppointmentDeps,
} from "@/features/appointments";
import { AttachmentManager, MAX_ATTACHMENTS_PER_OWNER } from "@/features/files";
import { can, requireHouseholdAccess } from "@/features/households";
import { getMedicalDeps, listLinkableVaccinations } from "@/features/medical";
import { utcToLocalParts } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { formatMoney, isCurrency, minorToInput } from "@/lib/money";

export default async function AppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireHouseholdAccess();
  const t = await getTranslations("appointments");
  const format = await getFormatter();
  const result = await getAppointment(getAppointmentDeps(), ctx, id);
  if (!result.ok) notFound();
  const { appointment, attachments, vaccinationRecordId } = result.value;
  const canWrite = can(ctx.role, "data:write");
  const [animals, vaccinations] = await Promise.all([
    listAnimals(getAnimalDeps(), ctx),
    listLinkableVaccinations(getMedicalDeps(), ctx),
  ]);
  const options = animals.ok
    ? animals.value.map(({ id: animalId, name }) => ({ id: animalId, name }))
    : [];
  const animalName = options.find((o) => o.id === appointment.animalId)?.name;
  const local = utcToLocalParts(appointment.scheduledAt, appointment.timezone);
  const currency =
    appointment.currency && isCurrency(appointment.currency) ? appointment.currency : "EUR";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold break-words">{appointment.title}</h1>
        <p className="text-muted-foreground text-sm">
          {t(`types.${asAppointmentType(appointment.type)}`)}
          {animalName ? ` · ${animalName}` : ""}
        </p>
        <p className="text-sm">
          {format.dateTime(appointment.scheduledAt, {
            dateStyle: "full",
            timeStyle: "short",
            timeZone: appointment.timezone,
          })}
          {appointment.costMinor !== null && appointment.currency
            ? ` · ${t("cost", { amount: formatMoney(appointment.costMinor, appointment.currency, "en") })}`
            : ""}
        </p>
        <p className="text-muted-foreground text-sm">{t("disclaimer")}</p>
      </div>

      {vaccinationRecordId ? (
        <Card className="space-y-1">
          <h2 className="text-lg font-semibold">{t("linkedRecord")}</h2>
          <Link href={`/health/${vaccinationRecordId}`} className="text-primary text-sm underline">
            {t("viewRecord")}
          </Link>
        </Card>
      ) : null}

      <AttachmentManager
        owner={{ type: "appointment", id }}
        canWrite={canWrite}
        maxUploadMb={getEnv().MAX_UPLOAD_MB}
        maxFiles={MAX_ATTACHMENTS_PER_OWNER}
        items={attachments.map((a) => ({
          id: a.id,
          fileId: a.fileId,
          name: a.originalName ?? "file",
          sizeBytes: a.sizeBytes,
        }))}
      />

      {canWrite ? (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">{t("save")}</h2>
          <AppointmentForm
            appointmentId={id}
            animals={options}
            vaccinations={vaccinations.ok ? vaccinations.value : []}
            timezone={appointment.timezone}
            hasLinkedRecord={Boolean(vaccinationRecordId)}
            defaults={{
              animalId: appointment.animalId ?? "",
              type: asAppointmentType(appointment.type),
              title: appointment.title,
              date: local.date,
              time: local.time,
              cost:
                appointment.costMinor === null ? "" : minorToInput(appointment.costMinor, currency),
              currency,
              notes: appointment.notes ?? "",
              followUpDate: appointment.followUpDate ?? "",
              vaccinationRecord: "",
            }}
          />
        </Card>
      ) : appointment.notes ? (
        <Card>
          <p className="whitespace-pre-wrap">{appointment.notes}</p>
        </Card>
      ) : null}

      {canWrite ? (
        <Card>
          <DeleteAppointmentButton appointmentId={id} />
        </Card>
      ) : null}
      <Link href="/timeline" className="text-primary inline-block text-sm underline">
        {t("back")}
      </Link>
    </div>
  );
}

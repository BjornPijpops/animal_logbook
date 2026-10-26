import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAnimalDeps, listAnimals } from "@/features/animals";
import { AttachmentManager, MAX_ATTACHMENTS_PER_OWNER } from "@/features/files";
import { can, requireHouseholdAccess } from "@/features/households";
import {
  asRecordType,
  asSeverity,
  DeleteMedicalRecordButton,
  getMedicalDeps,
  getMedicalRecord,
  MedicalForm,
} from "@/features/medical";
import { findMedicationForRecord, getMedicationDeps } from "@/features/medications";
import { getEnv } from "@/lib/env";

export default async function HealthRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireHouseholdAccess();
  const t = await getTranslations("medical");
  const format = await getFormatter();
  const result = await getMedicalRecord(getMedicalDeps(), ctx, id);
  if (!result.ok) notFound();
  const { record, attachments } = result.value;
  const canWrite = can(ctx.role, "data:write");
  const animals = await listAnimals(getAnimalDeps(), ctx);
  const options = animals.ok
    ? animals.value.map(({ id: animalId, name }) => ({ id: animalId, name }))
    : [];
  const animalName = options.find((o) => o.id === record.animalId)?.name;
  const type = asRecordType(record.type);
  const linked =
    type === "medication" ? await findMedicationForRecord(getMedicationDeps(), ctx, id) : null;
  const medicationId = linked?.ok ? (linked.value?.id ?? null) : null;
  const day = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold break-words">{record.title}</h1>
        <p className="text-muted-foreground text-sm">
          {t(`types.${type}`)}
          {animalName ? ` · ${animalName}` : ""}
          {record.severity ? ` · ${t(`severity.${asSeverity(record.severity) ?? "mild"}`)}` : ""}
        </p>
        <p className="text-sm">
          {day(record.startedOn)}
          {record.endedOn ? ` – ${day(record.endedOn)}` : ""}
          {record.nextDueOn ? ` · ${t("fields.nextDueOn")}: ${day(record.nextDueOn)}` : ""}
        </p>
        <p className="text-muted-foreground text-sm">{t("disclaimer")}</p>
      </div>

      <AttachmentManager
        owner={{ type: "medical_record", id }}
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

      {type === "medication" && medicationId ? (
        <Card className="space-y-2">
          <p className="text-sm">{t("managedByMedications")}</p>
          <Link href={`/medications/${medicationId}`} className="text-primary text-sm underline">
            {t("openMedication")}
          </Link>
        </Card>
      ) : null}
      {type === "medication" && !medicationId && canWrite ? (
        <Card className="space-y-2">
          <p className="text-sm">{t("placeholderHint")}</p>
          <Link
            href={`/medications/new?fromRecord=${id}`}
            className={buttonVariants({ variant: "secondary" })}
          >
            {t("createMedicationFromRecord")}
          </Link>
        </Card>
      ) : null}

      {canWrite && !medicationId ? (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">{t("save")}</h2>
          <MedicalForm
            recordId={id}
            animals={options}
            defaults={{
              animalId: record.animalId,
              type,
              title: record.title,
              startedOn: record.startedOn,
              endedOn: record.endedOn ?? "",
              severity: asSeverity(record.severity) ?? "",
              nextDueOn: record.nextDueOn ?? "",
              notes: record.notes ?? "",
            }}
          />
        </Card>
      ) : record.notes ? (
        <Card>
          <p className="whitespace-pre-wrap">{record.notes}</p>
        </Card>
      ) : null}

      {canWrite && !medicationId ? (
        <Card>
          <DeleteMedicalRecordButton recordId={id} />
        </Card>
      ) : null}
      <Link href="/timeline" className="text-primary inline-block text-sm underline">
        {t("back")}
      </Link>
    </div>
  );
}

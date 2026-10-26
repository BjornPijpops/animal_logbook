import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { getAnimalDeps, listAnimals } from "@/features/animals";
import { getMedicalDeps, getMedicalRecord } from "@/features/medical";
import { can, requireHouseholdAccess } from "@/features/households";
import { EMPTY_MEDICATION_INPUT, MedicationForm } from "@/features/medications";
import { utcToLocalParts } from "@/lib/dates";

export default async function NewMedicationPage({
  searchParams,
}: {
  searchParams: Promise<{ animal?: string; fromRecord?: string }>;
}) {
  const { animal, fromRecord } = await searchParams;
  const { ctx } = await requireHouseholdAccess();
  if (!can(ctx.role, "data:write")) redirect("/medications");
  const t = await getTranslations("medications");
  const animals = await listAnimals(getAnimalDeps(), ctx);
  const options = animals.ok ? animals.value.map(({ id, name }) => ({ id, name })) : [];
  const preselected = options.some((o) => o.id === animal) ? (animal ?? "") : "";
  const source = fromRecord ? await getMedicalRecord(getMedicalDeps(), ctx, fromRecord) : null;
  const record =
    source?.ok && source.value.record.type === "medication" ? source.value.record : null;
  if (fromRecord && !record) redirect("/medications/new");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("newTitle")}</h1>
      <p className="text-muted-foreground text-sm">{t("disclaimer")}</p>
      {record ? <p className="text-sm">{t("fromRecordHint")}</p> : null}
      <Card>
        <MedicationForm
          animals={options}
          {...(record ? { fromRecordId: record.id } : {})}
          defaults={{
            ...EMPTY_MEDICATION_INPUT,
            animalId: record?.animalId ?? preselected,
            name: record?.title ?? "",
            notes: record?.notes ?? "",
            endedOn: record?.endedOn ?? "",
            startedOn: record?.startedOn ?? utcToLocalParts(new Date(), ctx.timezone).date,
          }}
        />
      </Card>
    </div>
  );
}

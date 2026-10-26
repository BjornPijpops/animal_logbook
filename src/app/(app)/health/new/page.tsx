import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { getAnimalDeps, listAnimals } from "@/features/animals";
import { can, requireHouseholdAccess } from "@/features/households";
import { asRecordType, EMPTY_MEDICAL_RECORD_INPUT, MedicalForm } from "@/features/medical";
import { utcToLocalParts } from "@/lib/dates";

export default async function NewHealthRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ animal?: string; type?: string }>;
}) {
  const { animal, type } = await searchParams;
  const { ctx } = await requireHouseholdAccess();
  if (!can(ctx.role, "data:write")) redirect("/timeline");
  const t = await getTranslations("medical");
  const animals = await listAnimals(getAnimalDeps(), ctx);
  const options = animals.ok ? animals.value.map(({ id, name }) => ({ id, name })) : [];
  const preselected = options.some((o) => o.id === animal) ? (animal ?? "") : "";
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("newTitle")}</h1>
      <p className="text-muted-foreground text-sm">{t("disclaimer")}</p>
      <Card>
        <MedicalForm
          animals={options}
          defaults={{
            ...EMPTY_MEDICAL_RECORD_INPUT,
            type: asRecordType(type ?? ""),
            animalId: preselected,
            startedOn: utcToLocalParts(new Date(), ctx.timezone).date,
          }}
        />
      </Card>
    </div>
  );
}

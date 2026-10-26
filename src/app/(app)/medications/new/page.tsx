import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { getAnimalDeps, listAnimals } from "@/features/animals";
import { can, requireHouseholdAccess } from "@/features/households";
import { EMPTY_MEDICATION_INPUT, MedicationForm } from "@/features/medications";
import { utcToLocalParts } from "@/lib/dates";

export default async function NewMedicationPage({
  searchParams,
}: {
  searchParams: Promise<{ animal?: string }>;
}) {
  const { animal } = await searchParams;
  const { ctx } = await requireHouseholdAccess();
  if (!can(ctx.role, "data:write")) redirect("/medications");
  const t = await getTranslations("medications");
  const animals = await listAnimals(getAnimalDeps(), ctx);
  const options = animals.ok ? animals.value.map(({ id, name }) => ({ id, name })) : [];
  const preselected = options.some((o) => o.id === animal) ? (animal ?? "") : "";
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("newTitle")}</h1>
      <p className="text-muted-foreground text-sm">{t("disclaimer")}</p>
      <Card>
        <MedicationForm
          animals={options}
          defaults={{
            ...EMPTY_MEDICATION_INPUT,
            animalId: preselected,
            startedOn: utcToLocalParts(new Date(), ctx.timezone).date,
          }}
        />
      </Card>
    </div>
  );
}

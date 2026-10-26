import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { getAnimalDeps, listAnimals } from "@/features/animals";
import { EMPTY_EXPENSE_INPUT, ExpenseForm } from "@/features/expenses";
import { can, requireHouseholdAccess } from "@/features/households";
import { getMedicationDeps, listMedications } from "@/features/medications";
import { utcToLocalParts } from "@/lib/dates";

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ animal?: string }>;
}) {
  const { animal } = await searchParams;
  const { ctx } = await requireHouseholdAccess();
  if (!can(ctx.role, "data:write")) redirect("/expenses");
  const t = await getTranslations("expenses");
  const [animals, medications] = await Promise.all([
    listAnimals(getAnimalDeps(), ctx),
    listMedications(getMedicationDeps(), ctx),
  ]);
  const options = animals.ok ? animals.value.map(({ id, name }) => ({ id, name })) : [];
  const preselected = options.some((o) => o.id === animal) ? (animal ?? "") : "";
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("newTitle")}</h1>
      <Card>
        <ExpenseForm
          animals={options}
          medications={
            medications.ok
              ? medications.value.map(({ id, name, animalName }) => ({ id, name, animalName }))
              : []
          }
          defaults={{
            ...EMPTY_EXPENSE_INPUT,
            animalId: preselected,
            date: utcToLocalParts(new Date(), ctx.timezone).date,
          }}
        />
      </Card>
    </div>
  );
}

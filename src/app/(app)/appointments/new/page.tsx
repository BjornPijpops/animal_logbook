import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { getAnimalDeps, listAnimals } from "@/features/animals";
import { AppointmentForm, EMPTY_APPOINTMENT_INPUT } from "@/features/appointments";
import { can, requireHouseholdAccess } from "@/features/households";
import { getMedicalDeps, listLinkableVaccinations } from "@/features/medical";
import { utcToLocalParts } from "@/lib/dates";

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ animal?: string }>;
}) {
  const { animal } = await searchParams;
  const { ctx } = await requireHouseholdAccess();
  if (!can(ctx.role, "data:write")) redirect("/timeline");
  const t = await getTranslations("appointments");
  const [animals, vaccinations] = await Promise.all([
    listAnimals(getAnimalDeps(), ctx),
    listLinkableVaccinations(getMedicalDeps(), ctx),
  ]);
  const options = animals.ok ? animals.value.map(({ id, name }) => ({ id, name })) : [];
  const preselected = options.some((o) => o.id === animal) ? (animal ?? "") : "";
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("newTitle")}</h1>
      <p className="text-muted-foreground text-sm">{t("disclaimer")}</p>
      <Card>
        <AppointmentForm
          animals={options}
          vaccinations={vaccinations.ok ? vaccinations.value : []}
          timezone={ctx.timezone}
          defaults={{
            ...EMPTY_APPOINTMENT_INPUT,
            animalId: preselected,
            date: utcToLocalParts(new Date(), ctx.timezone).date,
          }}
        />
      </Card>
    </div>
  );
}

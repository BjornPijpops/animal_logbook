import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import {
  AnimalForm,
  getAnimalDeps,
  getAnimalFormHints,
  getAnimalOverview,
  toAnimalInput,
} from "@/features/animals";
import { can, requireHouseholdAccess } from "@/features/households";

export default async function EditAnimalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireHouseholdAccess();
  if (!can(ctx.role, "data:write")) redirect(`/animals/${id}`);
  const t = await getTranslations("animals");
  const deps = getAnimalDeps();
  const [overview, hints] = await Promise.all([
    getAnimalOverview(deps, ctx, id),
    getAnimalFormHints(deps, ctx),
  ]);
  if (!overview.ok || !hints.ok) notFound();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">
        {t("editTitle", { name: overview.value.animal.name })}
      </h1>
      <Card>
        <AnimalForm
          animalId={id}
          defaults={toAnimalInput(overview.value.animal)}
          hints={hints.value}
        />
      </Card>
    </div>
  );
}

import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import {
  AnimalForm,
  EMPTY_ANIMAL_INPUT,
  getAnimalDeps,
  getAnimalFormHints,
} from "@/features/animals";
import { can, requireHouseholdAccess } from "@/features/households";

export default async function NewAnimalPage() {
  const { ctx } = await requireHouseholdAccess();
  if (!can(ctx.role, "data:write")) redirect("/animals");
  const t = await getTranslations("animals");
  const hints = await getAnimalFormHints(getAnimalDeps(), ctx);
  if (!hints.ok) notFound();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("newTitle")}</h1>
      <Card>
        <AnimalForm defaults={EMPTY_ANIMAL_INPUT} hints={hints.value} />
      </Card>
    </div>
  );
}

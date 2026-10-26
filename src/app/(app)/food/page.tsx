import { Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAnimalDeps, listAnimals } from "@/features/animals";
import {
  FoodFilter,
  foodRangeSchema,
  formatCenti,
  getFoodDeps,
  listDeletedFoodPlans,
  listFoodPlans,
  RestoreFoodPlanButton,
} from "@/features/food";
import { can, requireHouseholdAccess } from "@/features/households";

export default async function FoodPage({
  searchParams,
}: {
  searchParams: Promise<{ animal?: string }>;
}) {
  const query = await searchParams;
  const { animalId } = foodRangeSchema.parse({ animalId: query.animal ?? null });
  const { ctx } = await requireHouseholdAccess();
  const t = await getTranslations("food");
  const format = await getFormatter();
  const deps = getFoodDeps();
  const canWrite = can(ctx.role, "data:write");
  const [animals, list, deleted] = await Promise.all([
    listAnimals(getAnimalDeps(), ctx),
    listFoodPlans(deps, ctx, animalId),
    canWrite ? listDeletedFoodPlans(deps, ctx, animalId) : null,
  ]);
  if (!list.ok) notFound();
  const options = animals.ok ? animals.value.map(({ id, name }) => ({ id, name })) : [];
  const day = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {canWrite ? (
          <Link href="/food/new" className={buttonVariants()}>
            <Plus aria-hidden="true" className="size-4" />
            {t("add")}
          </Link>
        ) : null}
      </div>
      <p className="text-muted-foreground text-sm">{t("disclaimer")}</p>
      <p className="flex gap-4 text-sm">
        <Link href="/food/history" className="text-primary underline">
          {t("historyLink")}
        </Link>
        <Link href="/food/investigation" className="text-primary underline">
          {t("investigationLink")}
        </Link>
      </p>
      <FoodFilter animals={options} values={{ animalId, from: null, to: null }} withRange={false} />

      <section aria-labelledby="plans-heading" className="space-y-3">
        <h2 id="plans-heading" className="text-lg font-semibold">
          {t("listTitle")}
        </h2>
        {list.value.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ul className="space-y-3">
            {list.value.map((plan) => (
              <li key={plan.id}>
                <Card className="space-y-1">
                  <Link href={`/food/${plan.id}`} className="block underline">
                    <span className="font-medium break-words">
                      {plan.brand}
                      {plan.flavor ? ` ${plan.flavor}` : ""}
                    </span>
                  </Link>
                  <p className="text-sm">
                    {plan.animalName} · {t(`types.${plan.type}`)}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {day(plan.startedOn)} – {plan.endedOn ? day(plan.endedOn) : t("ongoing")}
                  </p>
                  {plan.mealCount > 0 ? (
                    <p className="text-sm">
                      {t("meals.daily")}: {formatCenti(plan.dailyCenti)} {t(`units.${plan.unit}`)}
                    </p>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {deleted?.ok && deleted.value.length > 0 ? (
        <section aria-labelledby="deleted-heading" className="space-y-3">
          <h2 id="deleted-heading" className="text-lg font-semibold">
            {t("deletedTitle")}
          </h2>
          <ul className="space-y-3">
            {deleted.value.map((plan) => (
              <li key={plan.id}>
                <Card className="flex items-center justify-between gap-3">
                  <span className="break-words">
                    {plan.brand} · {plan.animalName}
                  </span>
                  <RestoreFoodPlanButton id={plan.id} label={plan.brand} />
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

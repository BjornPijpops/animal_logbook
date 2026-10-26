import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { getAnimalDeps, listAnimals } from "@/features/animals";
import {
  DeleteFoodPlanButton,
  FoodPlanForm,
  formatCenti,
  getFoodDeps,
  getFoodPlan,
  PurchaseForm,
  RestoreFoodPlanButton,
  UnlinkPurchaseButton,
} from "@/features/food";
import { can, requireHouseholdAccess } from "@/features/households";
import { utcToLocalParts } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

export default async function FoodPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireHouseholdAccess();
  const t = await getTranslations("food");
  const format = await getFormatter();
  const result = await getFoodPlan(getFoodDeps(), ctx, id);
  if (!result.ok) notFound();
  const { plan, meals, dailyCenti, purchases } = result.value;
  const canWrite = can(ctx.role, "data:write");
  const deleted = plan.deletedAt !== null;
  const animals = canWrite && !deleted ? await listAnimals(getAnimalDeps(), ctx) : null;
  const title = plan.flavor ? `${plan.brand} ${plan.flavor}` : plan.brand;
  const day = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  const unit = t(`units.${plan.unit}`);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold break-words">{title}</h1>
        <p className="text-sm">
          {plan.animalName} · {t(`types.${plan.type}`)}
        </p>
        <p className="text-muted-foreground text-sm">
          {day(plan.startedOn)} – {plan.endedOn ? day(plan.endedOn) : t("ongoing")}
        </p>
        {plan.kcalPer100g ? (
          <p className="text-sm">{t("kcalLine", { kcal: plan.kcalPer100g })}</p>
        ) : null}
      </div>
      <p className="text-muted-foreground text-sm">{t("disclaimer")}</p>

      {deleted ? (
        <Card className="flex items-center justify-between gap-3">
          <p>{t("deletedNotice")}</p>
          {canWrite ? <RestoreFoodPlanButton id={id} label={title} /> : null}
        </Card>
      ) : null}

      <section aria-labelledby="meals-heading" className="space-y-2">
        <h2 id="meals-heading" className="text-lg font-semibold">
          {t("meals.title")}
        </h2>
        {meals.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("meals.none")}</p>
        ) : (
          <>
            <ul className="text-sm">
              {meals.map((meal) => (
                <li key={meal.timeOfDay}>
                  {meal.timeOfDay} · {formatCenti(meal.amountCenti)} {unit}
                </li>
              ))}
            </ul>
            <p className="font-medium" data-testid="daily-quantity">
              {t("meals.daily")}: {formatCenti(dailyCenti)} {unit}
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="purchases-heading" className="space-y-3">
        <h2 id="purchases-heading" className="text-lg font-semibold">
          {t("purchases.title")}
        </h2>
        <p className="text-muted-foreground text-sm">{t("purchases.note")}</p>
        {purchases.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("purchases.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {purchases.map((purchase) => (
              <li key={purchase.id}>
                <Card className="flex items-center justify-between gap-3">
                  <Link href={`/expenses/${purchase.id}`} className="text-sm underline">
                    {day(purchase.incurredOn)} ·{" "}
                    {formatMoney(purchase.amountMinor, purchase.currency, "en")}
                  </Link>
                  {canWrite ? (
                    <UnlinkPurchaseButton
                      planId={id}
                      expenseId={purchase.id}
                      label={day(purchase.incurredOn)}
                    />
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
        {canWrite && !deleted ? (
          <Card>
            <PurchaseForm
              planId={id}
              defaults={{
                date: utcToLocalParts(new Date(), ctx.timezone).date,
                amount: "",
                currency: "EUR",
                notes: "",
              }}
            />
          </Card>
        ) : null}
      </section>

      {canWrite && !deleted ? (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">{t("save")}</h2>
          <FoodPlanForm
            planId={id}
            animals={animals?.ok ? animals.value.map(({ id: a, name }) => ({ id: a, name })) : []}
            defaults={{
              animalId: plan.animalId,
              brand: plan.brand,
              flavor: plan.flavor ?? "",
              type: plan.type,
              unit: plan.unit,
              startedOn: plan.startedOn,
              endedOn: plan.endedOn ?? "",
              kcalPer100g: plan.kcalPer100g ? String(plan.kcalPer100g) : "",
              notes: plan.notes ?? "",
              startNote: plan.startNote ?? "",
              endNote: plan.endNote ?? "",
              meals: meals.map((meal) => ({
                time: meal.timeOfDay,
                amount: formatCenti(meal.amountCenti),
              })),
            }}
          />
        </Card>
      ) : plan.notes ? (
        <Card>
          <p className="whitespace-pre-wrap">{plan.notes}</p>
        </Card>
      ) : null}

      {canWrite && !deleted ? (
        <Card>
          <DeleteFoodPlanButton planId={id} />
        </Card>
      ) : null}
      <Link href="/food" className="text-primary inline-block text-sm underline">
        {t("back")}
      </Link>
    </div>
  );
}

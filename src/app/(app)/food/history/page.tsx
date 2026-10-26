import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { getAnimalDeps, listAnimals } from "@/features/animals";
import {
  FoodFilter,
  foodRangeSchema,
  getFoodDeps,
  listDietHistory,
  type FoodChange,
} from "@/features/food";
import { requireHouseholdAccess } from "@/features/households";

export default async function FoodHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ animal?: string; from?: string; to?: string }>;
}) {
  const query = await searchParams;
  const range = foodRangeSchema.parse({
    animalId: query.animal ?? null,
    from: query.from || null,
    to: query.to || null,
  });
  const { ctx } = await requireHouseholdAccess();
  const t = await getTranslations("food");
  const format = await getFormatter();
  const [animals, history] = await Promise.all([
    listAnimals(getAnimalDeps(), ctx),
    listDietHistory(getFoodDeps(), ctx, range),
  ]);
  if (!history.ok) notFound();
  const options = animals.ok ? animals.value.map(({ id, name }) => ({ id, name })) : [];
  const day = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  const byAnimal = new Map<string, FoodChange[]>();
  for (const change of history.value) {
    const list = byAnimal.get(change.animalName) ?? [];
    list.push(change);
    byAnimal.set(change.animalName, list);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("history.title")}</h1>
      <p className="text-muted-foreground text-sm">{t("history.intro")}</p>
      <FoodFilter animals={options} values={range} withRange />
      {byAnimal.size === 0 ? (
        <p className="text-muted-foreground text-sm">{t("history.empty")}</p>
      ) : (
        [...byAnimal.entries()].map(([name, changes]) => (
          <section key={name} className="space-y-2">
            <h2 className="text-lg font-semibold">{name}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{t("history.caption", { name })}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="py-1 pr-3">
                      {t("columns.date")}
                    </th>
                    <th scope="col" className="py-1 pr-3">
                      {t("columns.change")}
                    </th>
                    <th scope="col" className="py-1">
                      {t("columns.note")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((change) => (
                    <tr key={`${change.planId}-${change.kind}`} className="border-t">
                      <td className="py-1 pr-3 whitespace-nowrap">{day(change.date)}</td>
                      <td className="py-1 pr-3 break-words">
                        <Link href={`/food/${change.planId}`} className="underline">
                          {t(`history.${change.kind}`, { label: change.label })}
                        </Link>
                      </td>
                      <td className="py-1 break-words">{change.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
      <Link href="/food" className="text-primary inline-block text-sm underline">
        {t("back")}
      </Link>
    </div>
  );
}

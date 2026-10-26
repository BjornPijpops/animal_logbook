import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { getAnimalDeps, listAnimals } from "@/features/animals";
import { FoodFilter, foodRangeSchema, getFoodDeps, investigate } from "@/features/food";
import { requireHouseholdAccess } from "@/features/households";

export default async function FoodInvestigationPage({
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
  const [animals, entries] = await Promise.all([
    listAnimals(getAnimalDeps(), ctx),
    investigate(getFoodDeps(), ctx, range),
  ]);
  if (!entries.ok) notFound();
  const options = animals.ok ? animals.value.map(({ id, name }) => ({ id, name })) : [];
  const day = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("investigation.title")}</h1>
      <Card role="note" className="space-y-1">
        <p className="font-medium">{t("investigation.disclaimer")}</p>
        <p className="text-muted-foreground text-sm">{t("investigation.intro")}</p>
      </Card>
      <FoodFilter animals={options} values={range} withRange />
      {entries.value.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("investigation.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t("investigation.caption")}</caption>
            <thead>
              <tr>
                <th scope="col" className="py-1 pr-3">
                  {t("columns.date")}
                </th>
                <th scope="col" className="py-1 pr-3">
                  {t("columns.animal")}
                </th>
                <th scope="col" className="py-1 pr-3">
                  {t("columns.kind")}
                </th>
                <th scope="col" className="py-1">
                  {t("columns.detail")}
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.value.map((entry) => (
                <tr
                  key={
                    entry.source === "food" ? `f-${entry.planId}-${entry.kind}` : `r-${entry.id}`
                  }
                  className="border-t"
                >
                  <td className="py-1 pr-3 whitespace-nowrap">{day(entry.date)}</td>
                  <td className="py-1 pr-3">{entry.animalName}</td>
                  {entry.source === "food" ? (
                    <>
                      <td className="py-1 pr-3">{t(`investigation.food_${entry.kind}`)}</td>
                      <td className="py-1 break-words">
                        <Link href={`/food/${entry.planId}`} className="underline">
                          {entry.label}
                        </Link>
                        {entry.note ? ` · ${entry.note}` : ""}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-1 pr-3">{t(`investigation.record_${entry.type}`)}</td>
                      <td className="py-1 break-words">{entry.title}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Link href="/food" className="text-primary inline-block text-sm underline">
        {t("back")}
      </Link>
    </div>
  );
}

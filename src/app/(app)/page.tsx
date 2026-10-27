import { getTranslations } from "next-intl/server";
import { PageShell } from "@/components/ui/page-shell";
import { asSpecies, getAnimalDeps, listAnimals } from "@/features/animals";
import {
  AnimalHeader,
  DashboardView,
  getDashboard,
  getDashboardDeps,
  type HeaderAnimal,
} from "@/features/dashboard";
import { can, requireHouseholdAccess } from "@/features/households";

export default async function HomePage() {
  const { user, ctx } = await requireHouseholdAccess();
  const t = await getTranslations("home");
  const ta = await getTranslations("animals");
  const [result, animalList] = await Promise.all([
    getDashboard(getDashboardDeps(), ctx),
    listAnimals(getAnimalDeps(), ctx),
  ]);
  const animals: HeaderAnimal[] = animalList.ok
    ? animalList.value.map((animal) => ({
        id: animal.id,
        name: animal.name,
        subtitle: [
          animal.species === "other"
            ? animal.speciesOther
            : ta(`species.${asSpecies(animal.species)}`),
          animal.breed,
        ]
          .filter(Boolean)
          .join(", "),
        photoUrl: animal.thumbFileId ? `/api/files/${animal.thumbFileId}` : null,
      }))
    : [];
  const canWrite = can(ctx.role, "data:write");
  return (
    <PageShell
      width="wide"
      title={t("welcome", { name: user.name })}
      description={t("household", { name: ctx.householdName })}
    >
      <AnimalHeader animals={animals} canWrite={canWrite} />
      {result.ok ? (
        <DashboardView dashboard={result.value} timezone={ctx.timezone} canWrite={canWrite} />
      ) : null}
    </PageShell>
  );
}

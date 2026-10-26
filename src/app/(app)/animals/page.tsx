import { PawPrint, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { asSpecies, getAnimalDeps, listAnimals, OfflineEmergencyToggle } from "@/features/animals";
import { can, requireHouseholdAccess } from "@/features/households";

export default async function AnimalsPage() {
  const { ctx } = await requireHouseholdAccess();
  const t = await getTranslations("animals");
  const result = await listAnimals(getAnimalDeps(), ctx);
  if (!result.ok) notFound();
  const animals = result.value;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {can(ctx.role, "data:write") ? (
          <Link
            href="/animals/new"
            className="bg-primary text-primary-foreground inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium"
          >
            <Plus aria-hidden="true" className="size-4" />
            {t("add")}
          </Link>
        ) : null}
      </div>
      {!can(ctx.role, "data:write") ? (
        <p className="text-muted-foreground text-sm">{t("viewerNote")}</p>
      ) : null}

      {animals.length === 0 ? (
        <Card>
          <h2 className="text-lg font-semibold">{t("empty.title")}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{t("empty.body")}</p>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {animals.map((animal) => (
            <li key={animal.id}>
              <Link
                href={`/animals/${animal.id}`}
                className="border-border bg-card hover:bg-muted flex min-h-11 items-center gap-3 rounded-xl border p-3"
              >
                {animal.thumbFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element -- authenticated, same-origin image
                  <img
                    src={`/api/files/${animal.thumbFileId}`}
                    alt=""
                    width={56}
                    height={56}
                    className="size-14 rounded-lg object-cover"
                  />
                ) : (
                  <span className="bg-muted flex size-14 items-center justify-center rounded-lg">
                    <PawPrint aria-hidden="true" className="size-6" />
                    <span className="sr-only">{t("noPhoto")}</span>
                  </span>
                )}
                <span>
                  <span className="block font-medium">{animal.name}</span>
                  <span className="text-muted-foreground block text-sm">
                    {animal.species === "other"
                      ? animal.speciesOther
                      : t(`species.${asSpecies(animal.species)}`)}
                    {animal.breed ? ` · ${animal.breed}` : ""}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <OfflineEmergencyToggle />
    </div>
  );
}

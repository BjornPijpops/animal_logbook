import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import {
  asSpecies,
  DeleteAnimalButton,
  getAnimalDeps,
  getAnimalOverview,
  getPreferredWeightUnit,
  PhotoManager,
  WeightPanel,
} from "@/features/animals";
import { can, requireHouseholdAccess } from "@/features/households";

const linkClass =
  "border-border bg-card hover:bg-muted inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium";

export default async function AnimalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, ctx } = await requireHouseholdAccess();
  const t = await getTranslations("animals");
  const deps = getAnimalDeps();
  const result = await getAnimalOverview(deps, ctx, id);
  if (!result.ok) notFound();
  const { animal, photos, weights } = result.value;
  const unit = await getPreferredWeightUnit(deps, user.id);
  const canWrite = can(ctx.role, "data:write");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{animal.name}</h1>
        <p className="text-muted-foreground text-sm">
          {animal.species === "other"
            ? animal.speciesOther
            : t(`species.${asSpecies(animal.species)}`)}
          {animal.breed ? ` · ${animal.breed}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/animals/${id}/emergency`} className={linkClass}>
          {t("emergencyCard")}
        </Link>
        <Link href={`/timeline?animal=${id}`} className={linkClass}>
          {t("healthLink")}
        </Link>
        <Link href={`/documents?animal=${id}`} className={linkClass}>
          {t("documentsLink")}
        </Link>
        {canWrite ? (
          <>
            <Link href={`/appointments/new?animal=${id}`} className={linkClass}>
              {t("addAppointment")}
            </Link>
            <Link href={`/health/new?animal=${id}`} className={linkClass}>
              {t("addRecord")}
            </Link>
          </>
        ) : null}
        {canWrite ? (
          <Link href={`/animals/${id}/edit`} className={linkClass}>
            {t("editTitle", { name: animal.name })}
          </Link>
        ) : null}
      </div>

      <PhotoManager
        animalId={id}
        canWrite={canWrite}
        photos={photos.map((p) => ({
          id: p.id,
          fileId: p.fileId,
          thumbFileId: p.thumbFileId,
          isPrimary: p.isPrimary,
        }))}
      />
      <WeightPanel
        animalId={id}
        unit={unit}
        canWrite={canWrite}
        today={new Date().toISOString().slice(0, 10)}
        entries={weights.map((w) => ({
          id: w.id,
          measuredAt: w.measuredAt.toISOString(),
          weightGrams: w.weightGrams,
          note: w.note,
        }))}
      />
      {canWrite ? (
        <Card>
          <DeleteAnimalButton animalId={id} name={animal.name} />
        </Card>
      ) : null}
    </div>
  );
}

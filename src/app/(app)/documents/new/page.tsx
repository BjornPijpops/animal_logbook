import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { getAnimalDeps, listAnimals } from "@/features/animals";
import { DocumentUploadForm, EMPTY_DOCUMENT_INPUT } from "@/features/documents";
import { can, requireHouseholdAccess } from "@/features/households";
import { getEnv } from "@/lib/env";

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ animal?: string }>;
}) {
  const { animal } = await searchParams;
  const { ctx } = await requireHouseholdAccess();
  if (!can(ctx.role, "data:write")) redirect("/documents");
  const t = await getTranslations("documents");
  const animals = await listAnimals(getAnimalDeps(), ctx);
  const options = animals.ok ? animals.value.map(({ id, name }) => ({ id, name })) : [];
  const preselected = options.some((o) => o.id === animal) ? (animal ?? "") : "";
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("newTitle")}</h1>
      <Card>
        <DocumentUploadForm
          animals={options}
          maxUploadMb={getEnv().MAX_UPLOAD_MB}
          defaults={{ ...EMPTY_DOCUMENT_INPUT, animalId: preselected }}
        />
      </Card>
    </div>
  );
}

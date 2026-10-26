import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EmergencyCard, getAnimalDeps, getEmergencyCard, PrintButton } from "@/features/animals";
import { requireHouseholdAccess } from "@/features/households";

export default async function EmergencyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireHouseholdAccess();
  const t = await getTranslations("animals");
  const result = await getEmergencyCard(getAnimalDeps(), ctx, id);
  if (!result.ok) notFound();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-2xl font-semibold">{t("emergency.title")}</h1>
        <PrintButton />
      </div>
      <EmergencyCard card={result.value} />
      <Link
        href={`/animals/${id}`}
        className="text-primary inline-block text-sm underline print:hidden"
      >
        {t("emergency.back", { name: result.value.animal.name })}
      </Link>
    </div>
  );
}

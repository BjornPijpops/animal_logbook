import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { requireHouseholdAccess } from "@/features/households";

export default async function HomePage() {
  const { user, ctx } = await requireHouseholdAccess();
  const t = await getTranslations("home");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("welcome", { name: user.name })}</h1>
        <p className="text-muted-foreground text-sm">
          {t("household", { name: ctx.householdName })}
        </p>
      </div>
      <Link
        href="/animals"
        className="bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium"
      >
        {t("animalsLink")}
      </Link>
      <Card>
        <h2 className="text-lg font-semibold">{t("emptyTitle")}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{t("emptyBody")}</p>
      </Card>
    </div>
  );
}

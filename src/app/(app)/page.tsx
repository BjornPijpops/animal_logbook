import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { DashboardView, getDashboard, getDashboardDeps } from "@/features/dashboard";
import { requireHouseholdAccess } from "@/features/households";

export default async function HomePage() {
  const { user, ctx } = await requireHouseholdAccess();
  const t = await getTranslations("home");
  const result = await getDashboard(getDashboardDeps(), ctx);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("welcome", { name: user.name })}</h1>
        <p className="text-muted-foreground text-sm">
          {t("household", { name: ctx.householdName })}
        </p>
      </div>
      {result.ok ? (
        <DashboardView dashboard={result.value} timezone={ctx.timezone} />
      ) : (
        <Card>
          <h2 className="text-lg font-semibold">{t("emptyTitle")}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{t("emptyBody")}</p>
          <Link href="/animals" className="text-primary mt-2 inline-block text-sm underline">
            {t("animalsLink")}
          </Link>
        </Card>
      )}
    </div>
  );
}

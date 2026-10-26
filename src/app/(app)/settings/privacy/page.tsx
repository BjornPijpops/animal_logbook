import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getEnv } from "@/lib/env";
import { can, requireHouseholdAccess } from "@/features/households";
import { getPrivacyDeps, listExports, PrivacyPanel } from "@/features/privacy";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("privacy");
  return { title: t("title") };
}

export default async function PrivacyPage() {
  const { ctx } = await requireHouseholdAccess();
  const t = await getTranslations("privacy");
  const canExport = can(ctx.role, "data:export");
  const exports = canExport ? await listExports(getPrivacyDeps(), ctx) : [];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground text-sm">{t("intro")}</p>
      <PrivacyPanel
        canExport={canExport}
        canDeleteHousehold={can(ctx.role, "household:delete")}
        ttlHours={getEnv().EXPORT_TTL_HOURS}
        exports={exports.map((row) => ({
          ...row,
          requestedAt: row.requestedAt.toISOString(),
          expiresAt: row.expiresAt?.toISOString() ?? null,
        }))}
      />
      <Link href="/settings" className="text-primary inline-block text-sm underline">
        {t("back")}
      </Link>
    </div>
  );
}

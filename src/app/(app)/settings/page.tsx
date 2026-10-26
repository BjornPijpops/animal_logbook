import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { Card } from "@/components/ui/card";
import { PreferencesForm } from "@/features/auth";
import { can, requireHouseholdAccess } from "@/features/households";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const { user: session, ctx } = await requireHouseholdAccess();
  const isOwner = can(ctx.role, "audit:read");
  const t = await getTranslations("settings");
  const [user] = await getDb().select().from(users).where(eq(users.id, session.id));
  if (!user) notFound();

  const timezones = Intl.supportedValuesOf("timeZone");
  if (!timezones.includes(user.timezone)) timezones.unshift(user.timezone);
  const currencies = Intl.supportedValuesOf("currency");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <Card>
        <h2 className="mb-4 text-lg font-semibold">{t("preferencesTitle")}</h2>
        <PreferencesForm
          defaults={{
            name: user.name,
            phone: user.phone ?? "",
            timezone: user.timezone,
            weightUnit: user.weightUnit,
            defaultCurrency: user.defaultCurrency,
          }}
          timezones={timezones}
          currencies={currencies}
        />
      </Card>
      <Card className="space-y-3">
        <Link
          href="/settings/notifications"
          className="text-primary block text-lg font-semibold underline"
        >
          {t("notificationsLink")}
        </Link>
        <Link
          href="/settings/privacy"
          className="text-primary block text-lg font-semibold underline"
        >
          {t("privacyLink")}
        </Link>
        {isOwner ? (
          <Link
            href="/settings/audit"
            className="text-primary block text-lg font-semibold underline"
          >
            {t("auditLink")}
          </Link>
        ) : null}
      </Card>
    </div>
  );
}

import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { Card } from "@/components/ui/card";
import { PreferencesForm, requireSessionUser } from "@/features/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const session = await requireSessionUser();
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
            timezone: user.timezone,
            weightUnit: user.weightUnit,
            defaultCurrency: user.defaultCurrency,
          }}
          timezones={timezones}
          currencies={currencies}
        />
      </Card>
    </div>
  );
}

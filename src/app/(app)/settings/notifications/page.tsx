import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { requireSessionUser } from "@/features/auth";
import {
  getNotificationDeps,
  getNotificationSettings,
  getVapidPublicKey,
  NotificationSettings,
} from "@/features/notifications";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notifications");
  return { title: t("title") };
}

export default async function NotificationSettingsPage() {
  const user = await requireSessionUser();
  const t = await getTranslations("notifications");
  const settings = await getNotificationSettings(getNotificationDeps(), user.id);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <Card>
        <NotificationSettings
          preferences={settings.preferences}
          pushConfigured={settings.pushConfigured}
          vapidPublicKey={getVapidPublicKey()}
          deviceCount={settings.endpoints.length}
        />
      </Card>
      <Link href="/settings" className="text-primary inline-block text-sm underline">
        {t("back")}
      </Link>
    </div>
  );
}

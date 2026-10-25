import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";

export default async function OfflinePage() {
  const t = await getTranslations("offline");
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <Card className="w-full space-y-2">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("body")}</p>
      </Card>
    </main>
  );
}

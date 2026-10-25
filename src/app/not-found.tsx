import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <Card className="w-full space-y-2">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("body")}</p>
        <Link href="/" className="text-primary text-sm underline underline-offset-4">
          {t("home")}
        </Link>
      </Card>
    </main>
  );
}

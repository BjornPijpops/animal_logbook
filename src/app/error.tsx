"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error");
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <Card className="w-full space-y-3">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <Button onClick={reset}>{t("retry")}</Button>
      </Card>
    </main>
  );
}

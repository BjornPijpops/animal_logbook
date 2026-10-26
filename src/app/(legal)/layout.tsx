import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

export default async function LegalLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("legal");
  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-4 py-8">
      <main id="main">{children}</main>
      <nav aria-label={t("nav")} className="mt-10 flex gap-4 text-sm">
        <Link href="/privacy" className="text-primary underline underline-offset-4">
          {t("privacy.title")}
        </Link>
        <Link href="/disclaimer" className="text-primary underline underline-offset-4">
          {t("disclaimer.title")}
        </Link>
      </nav>
    </div>
  );
}

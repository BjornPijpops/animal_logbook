import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function LegalLinks() {
  const t = await getTranslations("legal");
  return (
    <nav
      aria-label={t("nav")}
      className="text-muted-foreground flex justify-center gap-4 pt-6 text-xs print:hidden"
    >
      <Link href="/privacy" className="underline underline-offset-4">
        {t("privacy.title")}
      </Link>
      <Link href="/disclaimer" className="underline underline-offset-4">
        {t("disclaimer.title")}
      </Link>
    </nav>
  );
}

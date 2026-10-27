import Link from "next/link";
import { useTranslations } from "next-intl";

// "N more" (or "N+ more" when the query itself was cut off) to the page that owns the hidden
// rows. Falls back to "See all" when only the cut-off flag is known.
export function MoreLink({ href, count, exact }: { href: string; count: number; exact: boolean }) {
  const t = useTranslations("dashboard");
  if (count <= 0 && exact) return null;
  const label =
    count <= 0
      ? t("seeAll")
      : exact
        ? t("comingUp.more", { count })
        : t("comingUp.morePlus", { count });
  return (
    <Link
      href={href}
      className="text-primary inline-flex min-h-11 items-center text-sm font-medium underline"
    >
      {label}
    </Link>
  );
}

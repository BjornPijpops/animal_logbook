import Link from "next/link";
import { getTranslations } from "next-intl/server";

const DOCUMENTS = {
  privacy: ["stored", "where", "retention", "sharing", "rights", "cookies", "contact"],
  disclaimer: ["notMedical", "reminders", "emergency", "accuracy"],
} as const;

export type LegalKind = keyof typeof DOCUMENTS;

export async function LegalDocument({ kind }: { kind: LegalKind }) {
  const t = await getTranslations(`legal.${kind}`);
  const common = await getTranslations("legal");
  const sections = DOCUMENTS[kind];
  return (
    <article className="space-y-6">
      <div role="note" className="border-border bg-muted rounded-md border p-3 text-sm">
        <strong>{common("template.title")}</strong> {common("template.body")}
      </div>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground text-sm">{t("intro")}</p>
      {sections.map((key) => (
        <section key={key} className="space-y-1">
          <h2 className="text-lg font-semibold">{t(`sections.${key}.title`)}</h2>
          <p className="text-sm leading-relaxed">{t(`sections.${key}.body`)}</p>
        </section>
      ))}
      <p className="text-sm">
        <Link href="/" className="text-primary underline underline-offset-4">
          {common("back")}
        </Link>
      </p>
    </article>
  );
}

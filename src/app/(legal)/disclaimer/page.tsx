import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/legal-document";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.disclaimer");
  return { title: t("title") };
}

export default function DisclaimerPage() {
  return <LegalDocument kind="disclaimer" />;
}

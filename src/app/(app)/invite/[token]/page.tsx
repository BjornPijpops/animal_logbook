import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { AcceptInviteButton } from "@/features/households";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invite");
  return { title: t("title") };
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("invite");
  return (
    <Card className="space-y-3">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground text-sm">{t("body")}</p>
      <AcceptInviteButton token={token} />
    </Card>
  );
}

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SignInForm } from "@/features/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signIn");
  return { title: t("submit") };
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const t = await getTranslations("auth");
  return (
    <>
      {error ? (
        <p role="alert" className="text-destructive mb-4 text-sm">
          {t("verifyError")}
        </p>
      ) : null}
      <SignInForm next={next} />
    </>
  );
}

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "../client";
import { signInSchema, type SignInInput } from "../schemas";
import { useFieldErrors } from "./use-field-errors";

type Problem = "invalid" | "unverified" | "rate_limited" | "resent" | null;

// Only same-site relative paths are allowed, to prevent open redirects.
export function safeNextPath(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
    ? next
    : "/";
}

export function SignInForm({ next }: { next?: string | undefined }) {
  const t = useTranslations("auth.signIn");
  const tc = useTranslations("common");
  const router = useRouter();
  const [problem, setProblem] = useState<Problem>(null);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({ resolver: zodResolver(signInSchema) });
  const fieldError = useFieldErrors(errors);
  const target = safeNextPath(next);

  async function onSubmit(values: SignInInput) {
    setProblem(null);
    const { error } = await authClient.signIn.email(values);
    if (!error) {
      router.push(target);
      router.refresh();
      return;
    }
    if (error.status === 403) setProblem("unverified");
    else if (error.status === 429) setProblem("rate_limited");
    else setProblem("invalid");
  }

  async function resend() {
    await authClient.sendVerificationEmail({ email: getValues("email"), callbackURL: "/" });
    setProblem("resent");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
      </div>
      {problem === "invalid" ? <Alert tone="error">{t("invalidCredentials")}</Alert> : null}
      {problem === "rate_limited" ? <Alert tone="error">{t("rateLimited")}</Alert> : null}
      {problem === "resent" ? <Alert tone="success">{t("resent")}</Alert> : null}
      {problem === "unverified" ? (
        <Alert tone="error">
          <p>{t("unverified")}</p>
          <Button variant="link" onClick={resend} className="mt-1">
            {t("resend")}
          </Button>
        </Alert>
      ) : null}
      <Field id="email" label={tc("email")} error={fieldError("email")}>
        {(aria) => <Input {...aria} type="email" autoComplete="email" {...register("email")} />}
      </Field>
      <Field id="password" label={tc("password")} error={fieldError("password")}>
        {(aria) => (
          <Input
            {...aria}
            type="password"
            autoComplete="current-password"
            {...register("password")}
          />
        )}
      </Field>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? t("submitting") : t("submit")}
      </Button>
      <p className="text-sm">
        <Link href="/forgot-password" className="text-primary underline underline-offset-4">
          {t("forgot")}
        </Link>
      </p>
      <p className="text-sm">
        {t("noAccount")}{" "}
        <Link href="/sign-up" className="text-primary underline underline-offset-4">
          {t("signUpLink")}
        </Link>
      </p>
    </form>
  );
}

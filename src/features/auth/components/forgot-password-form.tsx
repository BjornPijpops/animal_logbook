"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "../client";
import { forgotPasswordSchema, type ForgotPasswordInput } from "../schemas";
import { useFieldErrors } from "./use-field-errors";

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgot");
  const tc = useTranslations("common");
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });
  const fieldError = useFieldErrors(errors);

  async function onSubmit(values: ForgotPasswordInput) {
    // The response is identical whether or not the account exists.
    await authClient.requestPasswordReset({ email: values.email, redirectTo: "/reset-password" });
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">{t("sentTitle")}</h1>
        <Alert tone="success">{t("sentBody")}</Alert>
        <Link href="/sign-in" className="text-primary text-sm underline underline-offset-4">
          {t("backToSignIn")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
      </div>
      <Field id="email" label={tc("email")} error={fieldError("email")}>
        {(aria) => <Input {...aria} type="email" autoComplete="email" {...register("email")} />}
      </Field>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {t("submit")}
      </Button>
      <Link href="/sign-in" className="text-primary block text-sm underline underline-offset-4">
        {t("backToSignIn")}
      </Link>
    </form>
  );
}

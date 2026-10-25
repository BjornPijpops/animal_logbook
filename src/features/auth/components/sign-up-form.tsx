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
import { PASSWORD_MIN_LENGTH, signUpSchema, type SignUpInput } from "../schemas";
import { useFieldErrors } from "./use-field-errors";

export function SignUpForm() {
  const t = useTranslations("auth.signUp");
  const tc = useTranslations("common");
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({ resolver: zodResolver(signUpSchema) });
  const fieldError = useFieldErrors(errors);

  async function onSubmit(values: SignUpInput) {
    setFailed(false);
    const { error } = await authClient.signUp.email({
      ...values,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      callbackURL: "/",
    });
    if (error) setFailed(true);
    else setDone(true);
  }

  if (done) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">{t("checkEmailTitle")}</h1>
        <Alert tone="success">{t("checkEmailBody")}</Alert>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
      </div>
      {failed ? <Alert tone="error">{tc("genericError")}</Alert> : null}
      <Field id="name" label={tc("name")} error={fieldError("name")}>
        {(aria) => <Input {...aria} autoComplete="name" {...register("name")} />}
      </Field>
      <Field id="email" label={tc("email")} error={fieldError("email")}>
        {(aria) => <Input {...aria} type="email" autoComplete="email" {...register("email")} />}
      </Field>
      <Field
        id="password"
        label={tc("password")}
        hint={t("passwordHint", { min: PASSWORD_MIN_LENGTH })}
        error={fieldError("password", true)}
      >
        {(aria) => (
          <Input {...aria} type="password" autoComplete="new-password" {...register("password")} />
        )}
      </Field>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? t("submitting") : t("submit")}
      </Button>
      <p className="text-sm">
        {t("haveAccount")}{" "}
        <Link href="/sign-in" className="text-primary underline underline-offset-4">
          {t("signInLink")}
        </Link>
      </p>
    </form>
  );
}

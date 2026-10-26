"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { documentInputSchema, type DocumentInput } from "../schemas";
import { updateDocumentAction } from "../server/actions";
import { DocumentFields, type AnimalOption } from "./document-fields";

type Props = { documentId: string; defaults: DocumentInput; animals: AnimalOption[] };

export function EditForm({ documentId, defaults, animals }: Props) {
  const t = useTranslations("documents");
  const [status, setStatus] = useState<"idle" | "saved" | string>("idle");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DocumentInput>({
    resolver: zodResolver(documentInputSchema),
    defaultValues: defaults,
  });

  async function onSubmit(values: DocumentInput) {
    const result = await updateDocumentAction(documentId, values);
    setStatus(result.ok ? "saved" : t(`errors.${result.code}`));
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {status === "saved" ? <Alert tone="success">{t("saved")}</Alert> : null}
      {status !== "idle" && status !== "saved" ? <Alert tone="error">{status}</Alert> : null}
      <DocumentFields register={register} animals={animals} errors={errors} />
      <Button type="submit" disabled={isSubmitting}>
        {t("save")}
      </Button>
    </form>
  );
}

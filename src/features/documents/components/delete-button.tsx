"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { deleteDocumentAction } from "../server/actions";

export function DeleteDocumentButton({ documentId, title }: { documentId: string; title: string }) {
  const t = useTranslations("documents");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button
        variant="destructive"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t("deleteConfirm", { title }))) return;
          startTransition(async () => {
            const result = await deleteDocumentAction(documentId);
            if (result && !result.ok) setError(t(`errors.${result.code}`));
          });
        }}
      >
        {t("delete")}
      </Button>
    </div>
  );
}

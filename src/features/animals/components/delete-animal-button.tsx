"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { deleteAnimalAction } from "../server/actions";

export function DeleteAnimalButton({ animalId, name }: { animalId: string; name: string }) {
  const t = useTranslations("animals");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button
        variant="destructive"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t("deleteConfirm", { name }))) return;
          startTransition(async () => {
            const result = await deleteAnimalAction(animalId);
            if (result && !result.ok) setError(t(`errors.${result.code}`));
          });
        }}
      >
        {t("deleteAnimal")}
      </Button>
    </div>
  );
}

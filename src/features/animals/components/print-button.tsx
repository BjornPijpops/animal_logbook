"use client";

import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  const t = useTranslations("animals.emergency");
  return (
    <Button variant="secondary" className="print:hidden" onClick={() => window.print()}>
      <Printer aria-hidden="true" className="size-4" />
      {t("print")}
    </Button>
  );
}

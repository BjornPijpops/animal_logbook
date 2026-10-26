"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Select } from "@/components/ui/input";
import { switchHouseholdAction } from "../server/actions";

type Option = { householdId: string; householdName: string };

export function HouseholdSwitcher({ current, options }: { current: string; options: Option[] }) {
  const t = useTranslations("household.switcher");
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  if (options.length < 2) return null;

  function change(householdId: string) {
    setFailed(false);
    startTransition(async () => {
      const result = await switchHouseholdAction(householdId);
      if (result.ok) router.refresh();
      else setFailed(true);
    });
  }

  return (
    <div className="space-y-1 print:hidden">
      <label htmlFor="household-switcher" className="text-muted-foreground block text-xs">
        {t("label")}
      </label>
      <Select
        id="household-switcher"
        value={current}
        disabled={pending}
        onChange={(event) => change(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.householdId} value={option.householdId}>
            {option.householdName}
          </option>
        ))}
      </Select>
      {failed ? (
        <p role="alert" className="text-destructive text-xs">
          {t("error")}
        </p>
      ) : null}
    </div>
  );
}

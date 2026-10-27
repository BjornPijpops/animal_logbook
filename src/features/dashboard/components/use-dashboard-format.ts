import { useFormatter, useLocale } from "next-intl";

const dateOnly = (value: string) => new Date(`${value}T12:00:00Z`);

// Date helpers shared by the dashboard sections. Dates without a time are calendar days and are
// formatted in UTC so they never shift; instants use the household timezone.
export function useDashboardFormat(timezone: string, today: string, showAnimal: boolean) {
  const format = useFormatter();
  const locale = useLocale();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  return {
    day: (value: string) =>
      format.dateTime(dateOnly(value), { dateStyle: "medium", timeZone: "UTC" }),
    when: (value: Date) =>
      format.dateTime(value, { dateStyle: "medium", timeStyle: "short", timeZone: timezone }),
    time: (value: Date) => format.dateTime(value, { timeStyle: "short", timeZone: timezone }),
    relative: (value: string) =>
      rtf.format(
        Math.round((dateOnly(value).getTime() - dateOnly(today).getTime()) / 86_400_000),
        "day",
      ),
    // ICU arguments for "... for {animal}" strings; the animal is left out on a single-animal page.
    animal: (name: string | null) => ({
      animal: showAnimal && name ? name : "",
      hasAnimal: showAnimal && name ? "yes" : "no",
    }),
  };
}

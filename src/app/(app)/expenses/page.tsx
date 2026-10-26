import { Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/input";
import { getAnimalDeps, listAnimals } from "@/features/animals";
import {
  EXPENSE_CATEGORY_VALUES,
  EXPENSE_VIEWS,
  EXPORT_LIMIT,
  expenseFilterSchema,
  getExpenseDeps,
  getExpenseSummary,
  listDeletedExpenses,
  listExpenses,
  RestoreExpenseButton,
  SpendingChart,
  type ExpenseCategory,
  type ExpenseSummary,
  type ExpenseView,
  type SpendingPoint,
} from "@/features/expenses";
import { can, requireHouseholdAccess } from "@/features/households";
import { utcToLocalParts } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

const asView = (value: string): ExpenseView => EXPENSE_VIEWS.find((v) => v === value) ?? "monthly";

function groupByCurrency<T extends { currency: string }>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(row.currency, [...(groups.get(row.currency) ?? []), row]);
  return groups;
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { ctx } = await requireHouseholdAccess();
  const t = await getTranslations("expenses");
  const format = await getFormatter();
  const canWrite = can(ctx.role, "data:write");

  const view = asView(first(params.view));
  const currentYear = Number(utcToLocalParts(new Date(), ctx.timezone).date.slice(0, 4));
  const rawYear = first(params.year);
  // "All years" only makes sense for the category view; monthly buckets need one year.
  const year = rawYear === "all" && view === "category" ? null : Number(rawYear) || currentYear;
  const filter = expenseFilterSchema.parse({
    year,
    animalId: first(params.animal) || null,
    category: first(params.category) || null,
  });
  const page = Number(first(params.page)) || 1;

  const deps = getExpenseDeps();
  const [summary, list, animals, deleted] = await Promise.all([
    getExpenseSummary(deps, ctx, filter),
    listExpenses(deps, ctx, filter, page),
    listAnimals(getAnimalDeps(), ctx),
    canWrite ? listDeletedExpenses(deps, ctx) : null,
  ]);
  if (!summary.ok || !list.ok) notFound();
  const animalList = animals.ok ? animals.value : [];
  const years = [...new Set([currentYear, ...summary.value.years])].sort((a, b) => b - a);

  const query = (extra: Record<string, string> = {}) => {
    const next = new URLSearchParams();
    next.set("view", view);
    next.set("year", filter.year === null ? "all" : String(filter.year));
    if (filter.animalId) next.set("animal", filter.animalId);
    if (filter.category) next.set("category", filter.category);
    for (const [key, value] of Object.entries(extra)) next.set(key, value);
    return next;
  };
  const exportParams = new URLSearchParams();
  if (filter.year !== null) exportParams.set("year", String(filter.year));
  if (filter.animalId) exportParams.set("animal", filter.animalId);
  if (filter.category) exportParams.set("category", filter.category);

  const groups = buildGroups(summary.value, view, {
    month: (m) =>
      format.dateTime(new Date(Date.UTC(2000, m - 1, 1)), { month: "short", timeZone: "UTC" }),
    category: (c) => t(`categories.${c}`),
  });
  const chartLabelKey = `views.${view}` as const;
  const money = (minor: number, currency: string) => formatMoney(minor, currency, "en");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {canWrite ? (
          <Link href="/expenses/new" className={buttonVariants()}>
            <Plus aria-hidden="true" className="size-4" />
            {t("add")}
          </Link>
        ) : null}
      </div>
      <p className="text-muted-foreground text-sm">{t("intro")}</p>

      <nav aria-label={t("views.label")}>
        <ul className="flex flex-wrap gap-2">
          {EXPENSE_VIEWS.map((v) => (
            <li key={v}>
              <Link
                href={`/expenses?${query({ view: v }).toString()}`}
                aria-current={v === view ? "page" : undefined}
                className={cn(
                  buttonVariants({ variant: v === view ? "primary" : "secondary" }),
                  // No colour transition, so axe never samples a half-faded tab after navigating.
                  "transition-none",
                  v === view && "hover:bg-primary",
                )}
              >
                {t(`views.${v}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Card>
        <form method="get" role="search" aria-label={t("filters.title")} className="space-y-3">
          <input type="hidden" name="view" value={view} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="filter-year" label={t("filters.year")}>
              {(aria) => (
                <Select
                  {...aria}
                  name="year"
                  defaultValue={filter.year === null ? "all" : filter.year}
                >
                  {view === "category" ? (
                    <option value="all">{t("filters.allYears")}</option>
                  ) : null}
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field id="filter-animal" label={t("filters.animal")}>
              {(aria) => (
                <Select {...aria} name="animal" defaultValue={filter.animalId ?? ""}>
                  <option value="">{t("filters.allAnimals")}</option>
                  {animalList.map((animal) => (
                    <option key={animal.id} value={animal.id}>
                      {animal.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field id="filter-category" label={t("filters.category")}>
              {(aria) => (
                <Select {...aria} name="category" defaultValue={filter.category ?? ""}>
                  <option value="">{t("filters.allCategories")}</option>
                  {EXPENSE_CATEGORY_VALUES.map((c) => (
                    <option key={c} value={c}>
                      {t(`categories.${c}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={buttonVariants()}>
              {t("filters.apply")}
            </button>
            <a
              href={`/api/expenses/export?${exportParams.toString()}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              {t("export")}
            </a>
          </div>
          {list.value.total > EXPORT_LIMIT ? (
            <p role="status" className="text-sm">
              {t("exportCapped", { limit: EXPORT_LIMIT })}
            </p>
          ) : null}
        </form>
      </Card>

      <section aria-labelledby="summary-heading" className="space-y-4">
        <h2 id="summary-heading" className="text-lg font-semibold">
          {t(chartLabelKey)}
        </h2>
        {groups.length === 0 ? (
          <Card>
            <p className="text-muted-foreground text-sm">{t("emptySummary")}</p>
          </Card>
        ) : (
          groups.map((group) => (
            <Card key={group.currency} className="space-y-2">
              <h3 className="font-medium">{group.currency}</h3>
              <SpendingChart
                currency={group.currency}
                points={group.points}
                chartLabel={`${t(chartLabelKey)} (${group.currency})`}
                labelHeader={t(
                  view === "monthly"
                    ? "table.month"
                    : view === "annual"
                      ? "table.year"
                      : "table.category",
                )}
                amountHeader={t("table.amount")}
                totalLabel={t("table.total")}
              />
            </Card>
          ))
        )}
        <p className="text-muted-foreground text-sm">{t("noConversion")}</p>
      </section>

      <section aria-labelledby="list-heading" className="space-y-3">
        <h2 id="list-heading" className="text-lg font-semibold">
          {t("listTitle")}
        </h2>
        {list.value.total === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <>
            <p className="text-muted-foreground text-sm" aria-live="polite">
              {t("results", { count: list.value.total })}
            </p>
            <ul className="space-y-3">
              {list.value.items.map((item) => (
                <li key={item.id}>
                  <Card>
                    <Link href={`/expenses/${item.id}`} className="block space-y-1 underline">
                      <span className="font-medium break-words">{item.description}</span>
                    </Link>
                    <p className="text-sm">
                      {money(item.amountMinor, item.currency)} · {t(`categories.${item.category}`)}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {format.dateTime(new Date(`${item.incurredOn}T12:00:00Z`), {
                        dateStyle: "medium",
                        timeZone: "UTC",
                      })}
                      {item.animalName ? ` · ${item.animalName}` : ""}
                      {item.appointmentId ? ` · ${t("fromAppointment")}` : ""}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
            {list.value.pages > 1 ? (
              <nav
                aria-label={t("pagination", { page: list.value.page, pages: list.value.pages })}
                className="flex items-center justify-between gap-3"
              >
                {list.value.page > 1 ? (
                  <Link
                    href={`/expenses?${query({ page: String(list.value.page - 1) }).toString()}`}
                    className={buttonVariants({ variant: "secondary" })}
                  >
                    {t("previous")}
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-sm">
                  {t("pagination", { page: list.value.page, pages: list.value.pages })}
                </span>
                {list.value.page < list.value.pages ? (
                  <Link
                    href={`/expenses?${query({ page: String(list.value.page + 1) }).toString()}`}
                    className={buttonVariants({ variant: "secondary" })}
                  >
                    {t("next")}
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </>
        )}
      </section>

      {deleted?.ok && deleted.value.length > 0 ? (
        <section aria-labelledby="deleted-heading" className="space-y-3">
          <h2 id="deleted-heading" className="text-lg font-semibold">
            {t("deletedTitle")}
          </h2>
          <ul className="space-y-3">
            {deleted.value.map((item) => (
              <li key={item.id}>
                <Card className="flex items-center justify-between gap-3">
                  <span className="break-words">
                    {item.description} · {money(item.amountMinor, item.currency)}
                  </span>
                  <RestoreExpenseButton id={item.id} label={item.description} />
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

type Group = { currency: string; points: SpendingPoint[] };

// One chart per currency; months and years are filled in where it helps reading the chart.
function buildGroups(
  summary: ExpenseSummary,
  view: ExpenseView,
  labels: { month: (month: number) => string; category: (category: ExpenseCategory) => string },
): Group[] {
  switch (view) {
    case "monthly":
      return [...groupByCurrency(summary.monthly)].map(([currency, rows]) => ({
        currency,
        points: Array.from({ length: 12 }, (_, i) => ({
          key: String(i + 1),
          label: labels.month(i + 1),
          minor: rows.find((row) => row.month === i + 1)?.totalMinor ?? 0,
        })),
      }));
    case "annual":
      return [...groupByCurrency(summary.yearly)].map(([currency, rows]) => ({
        currency,
        points: rows.map((row) => ({
          key: String(row.year),
          label: String(row.year),
          minor: row.totalMinor,
        })),
      }));
    case "category":
      return [...groupByCurrency(summary.categories)].map(([currency, rows]) => ({
        currency,
        points: rows.map((row) => ({
          key: row.category,
          label: labels.category(row.category),
          minor: row.totalMinor,
        })),
      }));
  }
}

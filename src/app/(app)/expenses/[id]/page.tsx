import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { getAnimalDeps, listAnimals } from "@/features/animals";
import {
  DeleteExpenseButton,
  ExpenseForm,
  getExpense,
  getExpenseDeps,
  RestoreExpenseButton,
} from "@/features/expenses";
import { AttachmentManager, MAX_ATTACHMENTS_PER_OWNER } from "@/features/files";
import { can, requireHouseholdAccess } from "@/features/households";
import { getMedicationDeps, listMedications } from "@/features/medications";
import { getEnv } from "@/lib/env";
import { formatMoney, isCurrency, minorToInput } from "@/lib/money";

export default async function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireHouseholdAccess();
  const t = await getTranslations("expenses");
  const format = await getFormatter();
  const result = await getExpense(getExpenseDeps(), ctx, id);
  if (!result.ok) notFound();
  const { expense, attachments } = result.value;
  const canWrite = can(ctx.role, "data:write");
  const deleted = expense.deletedAt !== null;
  const manual = expense.appointmentId === null;
  const currency = isCurrency(expense.currency) ? expense.currency : "EUR";
  const [animals, medications] = await Promise.all([
    canWrite && manual && !deleted ? listAnimals(getAnimalDeps(), ctx) : null,
    canWrite && manual && !deleted ? listMedications(getMedicationDeps(), ctx) : null,
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold break-words">{expense.description}</h1>
        <p className="text-sm">
          {formatMoney(expense.amountMinor, expense.currency, "en")} ·{" "}
          {t(`categories.${expense.category}`)}
        </p>
        <p className="text-muted-foreground text-sm">
          {format.dateTime(new Date(`${expense.incurredOn}T12:00:00Z`), {
            dateStyle: "full",
            timeZone: "UTC",
          })}
          {expense.animalName ? ` · ${expense.animalName}` : ""}
        </p>
      </div>

      {deleted ? (
        <Card className="flex items-center justify-between gap-3">
          <p>{t("deletedNotice")}</p>
          {canWrite && manual ? <RestoreExpenseButton id={id} label={expense.description} /> : null}
        </Card>
      ) : null}

      {!manual ? (
        <Card className="space-y-2">
          <h2 className="text-lg font-semibold">{t("linkedTitle")}</h2>
          <p className="text-sm">{t("linkedBody")}</p>
          <Link
            href={`/appointments/${expense.appointmentId}`}
            className="text-primary text-sm underline"
          >
            {t("openAppointment")}
          </Link>
          {expense.notes ? <p className="whitespace-pre-wrap">{expense.notes}</p> : null}
        </Card>
      ) : null}

      {manual && !deleted ? (
        <AttachmentManager
          owner={{ type: "expense", id }}
          canWrite={canWrite}
          maxUploadMb={getEnv().MAX_UPLOAD_MB}
          maxFiles={MAX_ATTACHMENTS_PER_OWNER}
          items={attachments.map((a) => ({
            id: a.id,
            fileId: a.fileId,
            name: a.originalName ?? "file",
            sizeBytes: a.sizeBytes,
          }))}
        />
      ) : null}

      {manual && !deleted && canWrite ? (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">{t("save")}</h2>
          <ExpenseForm
            expenseId={id}
            animals={animals?.ok ? animals.value.map(({ id: a, name }) => ({ id: a, name })) : []}
            medications={
              medications?.ok
                ? medications.value.map(({ id: m, name, animalName }) => ({
                    id: m,
                    name,
                    animalName,
                  }))
                : []
            }
            defaults={{
              category: expense.category,
              date: expense.incurredOn,
              amount: minorToInput(expense.amountMinor, currency),
              currency,
              description: expense.description,
              notes: expense.notes ?? "",
              animalId: expense.animalId ?? "",
              medicationId: expense.medicationId ?? "",
            }}
          />
        </Card>
      ) : manual && expense.notes ? (
        <Card>
          <p className="whitespace-pre-wrap">{expense.notes}</p>
        </Card>
      ) : null}

      {manual && !deleted && canWrite ? (
        <Card>
          <DeleteExpenseButton expenseId={id} />
        </Card>
      ) : null}
      <Link href="/expenses" className="text-primary inline-block text-sm underline">
        {t("back")}
      </Link>
    </div>
  );
}

import { getSessionUser } from "@/features/auth";
import { exportExpensesCsv, expenseFilterSchema, getExpenseDeps } from "@/features/expenses";
import { resolveRequestCtx } from "@/features/households";

export const dynamic = "force-dynamic";

// Scoped to the caller's household; the filter mirrors the expenses page query string.
export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const ctx = await resolveRequestCtx(user);
  if (!ctx.ok) return new Response("Not found", { status: 404 });
  const params = new URL(request.url).searchParams;
  const filter = expenseFilterSchema.parse({
    year: params.get("year"),
    animalId: params.get("animal"),
    category: params.get("category"),
  });
  const csv = await exportExpensesCsv(getExpenseDeps(), ctx.value, filter);
  if (!csv.ok) return new Response("Forbidden", { status: 403 });
  const name = filter.year === null ? "expenses" : `expenses-${filter.year}`;
  return new Response(csv.value.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(csv.value.truncated ? { "X-Export-Truncated": "true" } : {}),
    },
  });
}

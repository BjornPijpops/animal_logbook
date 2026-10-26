import type { Database } from "@/db/client";
import { can, type Ctx } from "@/features/households";
import { err, ok, type Result } from "@/lib/result";
import { PAGE_SIZE, timelineQuerySchema } from "../schemas";
import { createTimelineRepository, type TimelineItem } from "./timeline.repository";

export type TimelineDeps = { db: Database };
export type TimelinePage = {
  items: TimelineItem[];
  total: number;
  page: number;
  pageCount: number;
};

export async function listTimeline(
  deps: TimelineDeps,
  ctx: Ctx,
  rawQuery: unknown,
): Promise<Result<TimelinePage>> {
  if (!can(ctx.role, "data:read")) return err("forbidden", "Not allowed");
  const parsed = timelineQuerySchema.safeParse(rawQuery);
  if (!parsed.success) return err("validation", "Invalid filter");
  const { items, total } = await createTimelineRepository(deps.db, ctx.householdId).list(
    parsed.data,
    { limit: PAGE_SIZE, offset: (parsed.data.page - 1) * PAGE_SIZE, timezone: ctx.timezone },
  );
  return ok({
    items,
    total,
    page: parsed.data.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
}

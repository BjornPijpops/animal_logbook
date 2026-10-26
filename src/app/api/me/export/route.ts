import { getSessionUser } from "@/features/auth";
import { resolveRequestCtx } from "@/features/households";
import { exportPersonalDataForUser } from "@/features/privacy";
import { contentDisposition } from "@/lib/http/content-disposition";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ password: z.string().min(1).max(1024) });

const STATUS = { forbidden: 403, rate_limited: 429, validation: 400 } as const;

// POST so the password never ends up in a URL, and so a link cannot trigger the download.
export async function POST(request: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const ctx = await resolveRequestCtx(user);
  if (!ctx.ok) return new Response("Not found", { status: 404 });

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return new Response("Password required", { status: 400 });

  const result = await exportPersonalDataForUser(ctx.value, body.data.password);
  if (!result.ok) {
    const code = result.error.code;
    const status =
      code === "forbidden" || code === "rate_limited" || code === "validation" ? STATUS[code] : 400;
    return new Response(code, { status });
  }
  return new Response(result.value.json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": contentDisposition("attachment", result.value.filename),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

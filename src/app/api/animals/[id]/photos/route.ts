import { addPhoto, getAnimalDeps } from "@/features/animals";
import { getSessionUser } from "@/features/auth";
import { resolveRequestCtx } from "@/features/households";
import { getEnv } from "@/lib/env";
import type { AppErrorCode } from "@/lib/result";
import { isSameOrigin } from "@/lib/security/origin";

export const dynamic = "force-dynamic";

const STATUS: Record<AppErrorCode, number> = {
  validation: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
};

function fail(code: AppErrorCode): Response {
  return Response.json({ ok: false, code }, { status: STATUS[code] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isSameOrigin(request, getEnv().APP_URL)) return fail("forbidden");
  const user = await getSessionUser();
  if (!user) return fail("unauthenticated");
  const ctx = await resolveRequestCtx(user);
  if (!ctx.ok) return fail(ctx.error.code);

  const deps = getAnimalDeps();
  // Cheap early rejection; the exact limit is enforced again on the decoded bytes.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > deps.maxUploadBytes + 64 * 1024) {
    return Response.json({ ok: false, code: "validation" }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  const photo = form?.get("photo");
  if (!(photo instanceof File)) return fail("validation");

  const { id } = await params;
  const result = await addPhoto(deps, ctx.value, id, Buffer.from(await photo.arrayBuffer()));
  return result.ok ? Response.json({ ok: true }) : fail(result.error.code);
}

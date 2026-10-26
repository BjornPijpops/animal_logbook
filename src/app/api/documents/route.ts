import { createDocument, getDocumentDeps } from "@/features/documents";
import { getSessionUser } from "@/features/auth";
import { resolveRequestCtx } from "@/features/households";
import { getEnv } from "@/lib/env";
import type { AppErrorCode } from "@/lib/result";
import { isSameOrigin } from "@/lib/security/origin";
import { rejectionOf } from "@/lib/uploads/prepare-upload";

export const dynamic = "force-dynamic";

const STATUS: Record<AppErrorCode, number> = {
  validation: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
};

function fail(code: AppErrorCode, reason?: string): Response {
  const status = reason === "too_large" ? 413 : STATUS[code];
  return Response.json({ ok: false, code, reason: reason ?? null }, { status });
}

const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request, getEnv().APP_URL)) return fail("forbidden");
  const user = await getSessionUser();
  if (!user) return fail("unauthenticated");
  const ctx = await resolveRequestCtx(user);
  if (!ctx.ok) return fail(ctx.error.code);

  const deps = getDocumentDeps();
  // Cheap early rejection; the exact limit is enforced again on the received bytes.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > deps.maxUploadBytes + 64 * 1024) return fail("validation", "too_large");

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return fail("validation", "empty");

  const result = await createDocument(
    deps,
    ctx.value,
    {
      type: field(form, "type"),
      title: field(form, "title"),
      notes: field(form, "notes"),
      expiresOn: field(form, "expiresOn"),
      animalId: field(form, "animalId"),
    },
    {
      data: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      declaredType: file.type,
    },
  );
  if (!result.ok) return fail(result.error.code, rejectionOf(result.error.message) ?? undefined);
  return Response.json({ ok: true, id: result.value.id });
}

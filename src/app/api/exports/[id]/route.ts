import { getSessionUser } from "@/features/auth";
import { resolveRequestCtx } from "@/features/households";
import { getExportDownloadForUser } from "@/features/privacy";
import { contentDisposition } from "@/lib/http/content-disposition";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const ctx = await resolveRequestCtx(user);
  if (!ctx.ok) return new Response("Not found", { status: 404 });

  const { id } = await params;
  const result = await getExportDownloadForUser(ctx.value, id);
  if (!result.ok) {
    return new Response(result.error.code === "forbidden" ? "Forbidden" : "Not found", {
      status: result.error.code === "forbidden" ? 403 : 404,
    });
  }
  const { data, filename } = result.value;
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition("attachment", filename),
      "Content-Length": String(data.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}

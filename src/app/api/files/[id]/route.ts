import { getSessionUser } from "@/features/auth";
import { getFileDeps, getFileForUser } from "@/features/files";
import { contentDisposition } from "@/lib/http/content-disposition";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const result = await getFileForUser(getFileDeps(), user.id, id);
  if (!result.ok) return notFound();
  const { file, data } = result.value;

  const etag = `"${file.checksumSha256}"`;
  const headers: Record<string, string> = {
    ETag: etag,
    "Cache-Control": "private, no-cache",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  // Only images may render inline. PDFs always download: a sandboxed PDF viewer is unreliable
  // and an inline PDF would run in the app's origin.
  const inline =
    file.mimeType.startsWith("image/") && new URL(request.url).searchParams.get("download") !== "1";
  headers["Content-Disposition"] = contentDisposition(
    inline ? "inline" : "attachment",
    file.originalName ?? "download",
  );
  return new Response(new Uint8Array(data), {
    headers: {
      ...headers,
      "Content-Type": file.mimeType,
      "Content-Length": String(data.byteLength),
    },
  });
}

import { getSessionUser } from "@/features/auth";
import { getFileForUser, getFileDeps } from "@/features/files";

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

  const etag = `"${result.value.file.checksumSha256}"`;
  const headers = {
    ETag: etag,
    "Cache-Control": "private, no-cache",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(new Uint8Array(result.value.data), {
    headers: {
      ...headers,
      "Content-Type": result.value.file.mimeType,
      "Content-Length": String(result.value.data.byteLength),
    },
  });
}

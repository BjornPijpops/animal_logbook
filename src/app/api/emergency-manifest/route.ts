import { getAnimalDeps, listEmergencyUrls } from "@/features/animals";
import { getSessionUser } from "@/features/auth";
import { resolveRequestCtx } from "@/features/households";

export const dynamic = "force-dynamic";

// URLs the client may copy into the opt-in offline cache. Personal data, so never cached by the SW itself.
export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const ctx = await resolveRequestCtx(user);
  if (!ctx.ok) return new Response("Not found", { status: 404 });
  const urls = await listEmergencyUrls(getAnimalDeps(), ctx.value);
  if (!urls.ok) return new Response("Forbidden", { status: 403 });
  return Response.json({ urls: urls.value }, { headers: { "Cache-Control": "private, no-store" } });
}

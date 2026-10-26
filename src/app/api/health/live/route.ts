export const dynamic = "force-dynamic";

// Liveness: the process answers. It deliberately touches nothing else, so a database outage does
// not make the orchestrator restart a healthy web server.
export function GET(): Response {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}

// Browsers always send Origin on cross-site POSTs; requiring it to match blocks CSRF on routes
// that, unlike server actions, get no built-in check.
export function isSameOrigin(request: Request, appUrl: string): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === new URL(appUrl).origin;
}

// Optional OAuth providers are structured but unused in V1 (email + password only).
// To add one, append an entry here and set both env vars; nothing else changes.
type ProviderConfig = { id: "github" | "google"; clientIdEnv: string; clientSecretEnv: string };

const PROVIDERS: readonly ProviderConfig[] = [];

export function buildSocialProviders(
  env: Record<string, string | undefined> = process.env,
): Record<string, { clientId: string; clientSecret: string }> {
  const result: Record<string, { clientId: string; clientSecret: string }> = {};
  for (const p of PROVIDERS) {
    const clientId = env[p.clientIdEnv];
    const clientSecret = env[p.clientSecretEnv];
    if (clientId && clientSecret) result[p.id] = { clientId, clientSecret };
  }
  return result;
}

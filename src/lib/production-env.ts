const PLACEHOLDER =
  /change[-_ ]?me|replace|example|ci-only|placeholder|your[-_ ]|todo|password123/i;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export type EnvProblem = { key: string; reason: string };

function hostOf(value: string): string | undefined {
  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
}

// Checks the settings that are safe in development but wrong in production. Problems name the key
// and the rule, never the value, so a misconfigured secret cannot end up in a log.
export function validateProductionEnv(env: Record<string, string | undefined>): EnvProblem[] {
  const problems: EnvProblem[] = [];
  const add = (key: string, reason: string) => problems.push({ key, reason });
  const value = (key: string) => env[key]?.trim() || undefined;

  for (const key of ["APP_URL", "DATABASE_URL", "AUTH_SECRET", "FILE_TOKEN_SECRET"]) {
    if (!value(key)) add(key, "is required");
  }
  for (const key of ["AUTH_SECRET", "FILE_TOKEN_SECRET"]) {
    const v = value(key);
    if (v && v.length < 32) add(key, "must be at least 32 characters");
    if (v && PLACEHOLDER.test(v)) add(key, "still has a placeholder value");
  }
  if (value("AUTH_SECRET") && value("AUTH_SECRET") === value("FILE_TOKEN_SECRET")) {
    add("FILE_TOKEN_SECRET", "must differ from AUTH_SECRET");
  }

  const appUrl = value("APP_URL");
  if (appUrl) {
    const host = hostOf(appUrl);
    if (!appUrl.startsWith("https://")) add("APP_URL", "must be an https:// URL in production");
    if (host && LOCAL_HOSTS.has(host)) add("APP_URL", "must not point at localhost");
    if (PLACEHOLDER.test(appUrl)) add("APP_URL", "still has a placeholder value");
  }

  const urls = ["DATABASE_URL", "WORKER_DATABASE_URL", "DATABASE_OWNER_URL"] as const;
  for (const key of urls) {
    const v = value(key);
    if (v && PLACEHOLDER.test(v)) add(key, "still has a placeholder value");
  }
  if (!value("WORKER_DATABASE_URL")) add("WORKER_DATABASE_URL", "is required");
  if (value("WORKER_DATABASE_URL") && value("WORKER_DATABASE_URL") === value("DATABASE_URL")) {
    add("WORKER_DATABASE_URL", "must use a different role than DATABASE_URL");
  }
  if (value("DATABASE_OWNER_URL") && value("DATABASE_OWNER_URL") === value("DATABASE_URL")) {
    add("DATABASE_URL", "must be the restricted app role, not the owner role");
  }

  const smtp = value("SMTP_HOST");
  if (!smtp || LOCAL_HOSTS.has(smtp)) add("SMTP_HOST", "must be a real SMTP server in production");
  const from = value("EMAIL_FROM");
  if (from && /@localhost\b|example\.(com|org)/i.test(from)) {
    add("EMAIL_FROM", "must use your own sender address");
  }

  const pub = value("VAPID_PUBLIC_KEY");
  const priv = value("VAPID_PRIVATE_KEY");
  if (Boolean(pub) !== Boolean(priv)) {
    add("VAPID_PUBLIC_KEY", "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set together");
  }
  if (value("ALLOW_LOCAL_PUSH_ENDPOINTS") === "true") {
    add("ALLOW_LOCAL_PUSH_ENDPOINTS", "must be false in production");
  }
  return problems;
}

export function assertProductionEnv(env: Record<string, string | undefined>): void {
  const problems = validateProductionEnv(env);
  if (problems.length === 0) return;
  const lines = problems.map((p) => `  - ${p.key}: ${p.reason}`).join("\n");
  throw new Error(`Refusing to start, the production configuration is invalid:\n${lines}`);
}

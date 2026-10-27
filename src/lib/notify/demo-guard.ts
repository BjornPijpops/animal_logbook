// Demo accounts (see src/demo and docs/adr/0020-demo-seeder.md) are fictional. This is the single
// definition of "a demo recipient": the SMTP mailer, the email channel and the push channel all
// call isDemoRecipient, so nothing is ever delivered to them whatever the worker or SMTP setup is.
// It is deliberately narrow (demo-*@example.test) because other suites use plain @example.test.
export const DEMO_RECIPIENT_PATTERN = /^demo-[a-z0-9._-]+@example\.test$/i;

export function isDemoRecipient(email: string): boolean {
  return DEMO_RECIPIENT_PATTERN.test(email.trim());
}

export const DEMO_DELIVERY_DISABLED = "delivery is disabled for demo recipients";

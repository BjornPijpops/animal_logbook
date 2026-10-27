// Demo accounts (see src/demo) are fictional. Whatever a worker or an SMTP setting says, nothing
// may ever be delivered to them: this check sits in every delivery path (SMTP mailer, email
// channel, push channel).
const DEMO_RECIPIENT = /^demo-[a-z0-9._-]+@example\.test$/i;

export function isDemoRecipient(email: string): boolean {
  return DEMO_RECIPIENT.test(email.trim());
}

export const DEMO_DELIVERY_DISABLED = "delivery is disabled for demo recipients";

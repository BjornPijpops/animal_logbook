import { z } from "zod";

export const DOCUMENT_TYPES = [
  "registration",
  "vaccination",
  "insurance",
  "invoice",
  "passport",
  "other",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const PAGE_SIZE = 20;
export const EXPIRING_SOON_DAYS = 30;

export const asDocumentType = (value: string): DocumentType =>
  DOCUMENT_TYPES.find((t) => t === value) ?? "other";

const text = (max: number) => z.string().trim().max(max);

// Empty strings come from HTML forms and mean "not set".
export const documentInputSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  title: text(120).min(1),
  notes: text(2000),
  expiresOn: z.union([z.literal(""), z.iso.date()]),
  animalId: z.union([z.literal(""), z.uuid()]),
});
export type DocumentInput = z.infer<typeof documentInputSchema>;

export const EMPTY_DOCUMENT_INPUT: DocumentInput = {
  type: "other",
  title: "",
  notes: "",
  expiresOn: "",
  animalId: "",
};

// "household" selects documents that are not linked to any animal.
export const documentQuerySchema = z.object({
  q: text(100).default(""),
  animal: z.union([z.literal(""), z.literal("household"), z.uuid()]).default(""),
  type: z.union([z.literal(""), z.enum(DOCUMENT_TYPES)]).default(""),
  expiring: z.boolean().default(false),
  page: z.number().int().min(1).max(10_000).default(1),
});
export type DocumentQuery = z.infer<typeof documentQuerySchema>;

export type ExpiryStatus = "expired" | "soon" | "ok";

// Both arguments are calendar dates (YYYY-MM-DD), so the comparison needs no timezone handling.
export function expiryStatus(expiresOn: string | null, today: string): ExpiryStatus | null {
  if (!expiresOn) return null;
  if (expiresOn < today) return "expired";
  const horizon = new Date(`${today}T12:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + EXPIRING_SOON_DAYS);
  return expiresOn <= horizon.toISOString().slice(0, 10) ? "soon" : "ok";
}

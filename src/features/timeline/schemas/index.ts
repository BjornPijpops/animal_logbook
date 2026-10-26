import { z } from "zod";
import { MEDICAL_RECORD_TYPES } from "@/features/medical";
import { APPOINTMENT_TYPES } from "@/features/appointments";

export const PAGE_SIZE = 20;

// "appointment" and "record" select a whole group; "appointment:vet" and "record:allergy" one type.
export const TIMELINE_TYPES = [
  "appointment",
  ...APPOINTMENT_TYPES.map((t) => `appointment:${t}` as const),
  "record",
  ...MEDICAL_RECORD_TYPES.map((t) => `record:${t}` as const),
] as const;
export type TimelineType = (typeof TIMELINE_TYPES)[number];

export const timelineQuerySchema = z
  .object({
    animal: z.union([z.literal(""), z.literal("household"), z.uuid()]).default(""),
    type: z.union([z.literal(""), z.enum(TIMELINE_TYPES)]).default(""),
    from: z.union([z.literal(""), z.iso.date()]).default(""),
    to: z.union([z.literal(""), z.iso.date()]).default(""),
    deleted: z.boolean().default(false),
    page: z.number().int().min(1).max(10_000).default(1),
  })
  .refine((q) => q.from === "" || q.to === "" || q.from <= q.to, { path: ["to"] });
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;

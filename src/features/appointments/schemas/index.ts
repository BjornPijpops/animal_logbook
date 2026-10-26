import { z } from "zod";
import { CURRENCIES, parseMoney } from "@/lib/money";
import { isRealDate } from "@/lib/dates";

export const APPOINTMENT_TYPES = [
  "vet",
  "grooming",
  "training",
  "vaccination",
  "medication",
] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

export const asAppointmentType = (value: string): AppointmentType =>
  APPOINTMENT_TYPES.find((t) => t === value) ?? "vet";

const text = (max: number) => z.string().trim().max(max);
const optionalDate = z.union([z.literal(""), z.iso.date()]);
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

// Empty strings come from HTML forms and mean "not set". `vaccinationRecord` is "new" to create a
// vaccination record for this visit, or the id of an existing unlinked one to link.
export const appointmentInputSchema = z
  .object({
    animalId: z.union([z.literal(""), z.uuid()]),
    type: z.enum(APPOINTMENT_TYPES),
    title: text(160).min(1),
    date: z.iso.date(),
    time: timeOfDay,
    cost: text(20),
    currency: z.enum(CURRENCIES),
    notes: text(4000),
    followUpDate: optionalDate,
    vaccinationRecord: z.union([z.literal(""), z.literal("new"), z.uuid()]),
  })
  .superRefine((value, ctx) => {
    if (!isRealDate(value.date)) {
      ctx.addIssue({ code: "custom", path: ["date"], message: "invalid" });
    }
    if (value.cost !== "" && parseMoney(value.cost, value.currency) === null) {
      ctx.addIssue({ code: "custom", path: ["cost"], message: "invalid_amount" });
    }
    if (value.followUpDate !== "" && value.followUpDate < value.date) {
      ctx.addIssue({ code: "custom", path: ["followUpDate"], message: "before_start" });
    }
    if (value.vaccinationRecord !== "" && (value.type !== "vaccination" || value.animalId === "")) {
      ctx.addIssue({ code: "custom", path: ["vaccinationRecord"], message: "not_applicable" });
    }
  });
export type AppointmentInput = z.infer<typeof appointmentInputSchema>;

export const EMPTY_APPOINTMENT_INPUT: AppointmentInput = {
  animalId: "",
  type: "vet",
  title: "",
  date: "",
  time: "09:00",
  cost: "",
  currency: "EUR",
  notes: "",
  followUpDate: "",
  vaccinationRecord: "",
};

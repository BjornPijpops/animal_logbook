import { z } from "zod";

export const MEDICAL_RECORD_TYPES = [
  "vaccination",
  "surgery",
  "illness",
  "injury",
  "allergy",
  "medication",
] as const;
export type MedicalRecordType = (typeof MEDICAL_RECORD_TYPES)[number];

export const SEVERITIES = ["mild", "moderate", "severe"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const asRecordType = (value: string): MedicalRecordType =>
  MEDICAL_RECORD_TYPES.find((t) => t === value) ?? "illness";
export const asSeverity = (value: string | null): Severity | null =>
  SEVERITIES.find((s) => s === value) ?? null;

// Which optional fields each record type uses. The form shows only these and the schema
// rejects the rest, so a record never carries fields that mean nothing for its type.
export const RECORD_FIELDS: Record<
  MedicalRecordType,
  { endDate: boolean; severity: boolean; nextDue: boolean }
> = {
  vaccination: { endDate: false, severity: false, nextDue: true },
  surgery: { endDate: false, severity: false, nextDue: false },
  illness: { endDate: true, severity: true, nextDue: false },
  injury: { endDate: true, severity: true, nextDue: false },
  allergy: { endDate: true, severity: true, nextDue: false },
  medication: { endDate: true, severity: false, nextDue: false },
};

const text = (max: number) => z.string().trim().max(max);
const optionalDate = z.union([z.literal(""), z.iso.date()]);

// Empty strings come from HTML forms and mean "not set".
export const medicalRecordInputSchema = z
  .object({
    animalId: z.uuid(),
    type: z.enum(MEDICAL_RECORD_TYPES),
    title: text(160).min(1),
    startedOn: z.iso.date(),
    endedOn: optionalDate,
    severity: z.union([z.literal(""), z.enum(SEVERITIES)]),
    nextDueOn: optionalDate,
    notes: text(4000),
  })
  .superRefine((value, ctx) => {
    const fields = RECORD_FIELDS[value.type];
    if (!fields.endDate && value.endedOn !== "") {
      ctx.addIssue({ code: "custom", path: ["endedOn"], message: "not_applicable" });
    }
    if (!fields.severity && value.severity !== "") {
      ctx.addIssue({ code: "custom", path: ["severity"], message: "not_applicable" });
    }
    if (!fields.nextDue && value.nextDueOn !== "") {
      ctx.addIssue({ code: "custom", path: ["nextDueOn"], message: "not_applicable" });
    }
    if (value.endedOn !== "" && value.endedOn < value.startedOn) {
      ctx.addIssue({ code: "custom", path: ["endedOn"], message: "before_start" });
    }
    if (value.nextDueOn !== "" && value.nextDueOn < value.startedOn) {
      ctx.addIssue({ code: "custom", path: ["nextDueOn"], message: "before_start" });
    }
  });
export type MedicalRecordInput = z.infer<typeof medicalRecordInputSchema>;

export const EMPTY_MEDICAL_RECORD_INPUT: MedicalRecordInput = {
  animalId: "",
  type: "illness",
  title: "",
  startedOn: "",
  endedOn: "",
  severity: "",
  nextDueOn: "",
  notes: "",
};

export const uuidSchema = z.uuid();

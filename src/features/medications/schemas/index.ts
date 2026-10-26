import { z } from "zod";
import { SCHEDULE_KINDS, type ScheduleKind } from "../schedule";

export { SCHEDULE_KINDS, type ScheduleKind };

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const MAX_TIMES_PER_DAY = 12;

const text = (max: number) => z.string().trim().max(max);
const optionalDate = z.union([z.literal(""), z.iso.date()]);
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const asScheduleKind = (value: string): ScheduleKind =>
  SCHEDULE_KINDS.find((kind) => kind === value) ?? "daily";

// Empty strings come from HTML forms and mean "not set". Name, dates and notes are stored on the
// linked medical record, so they are validated here but not duplicated in the medications table.
export const medicationInputSchema = z
  .object({
    animalId: z.uuid(),
    name: text(160).min(1),
    dosage: text(200).min(1),
    startedOn: z.iso.date(),
    endedOn: optionalDate,
    notes: text(4000),
    kind: z.enum(SCHEDULE_KINDS),
    times: z.array(timeOfDay).max(MAX_TIMES_PER_DAY),
    weekdays: z.array(z.number().int().min(1).max(7)).max(7),
    intervalDays: z.number().int().min(2).max(365).nullable(),
  })
  .superRefine((value, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (value.endedOn !== "" && value.endedOn < value.startedOn) issue("endedOn", "before_start");
    if (new Set(value.times).size !== value.times.length) issue("times", "duplicate_time");
    if (value.kind === "as_needed") {
      if (value.times.length > 0) issue("times", "not_applicable");
    } else if (value.times.length === 0) issue("times", "times_required");
    if (value.kind === "weekdays") {
      if (value.weekdays.length === 0) issue("weekdays", "weekdays_required");
    } else if (value.weekdays.length > 0) issue("weekdays", "not_applicable");
    if (value.kind === "every_n_days") {
      if (value.intervalDays === null) issue("intervalDays", "interval_required");
    } else if (value.intervalDays !== null) issue("intervalDays", "not_applicable");
  });
export type MedicationInput = z.infer<typeof medicationInputSchema>;

export const EMPTY_MEDICATION_INPUT: MedicationInput = {
  animalId: "",
  name: "",
  dosage: "",
  startedOn: "",
  endedOn: "",
  notes: "",
  kind: "daily",
  times: ["08:00"],
  weekdays: [],
  intervalDays: null,
};

export const DOSE_RESPONSES = ["given", "skipped"] as const;

export const doseInputSchema = z.object({
  // Omitted for as-needed medications, which are logged at the current minute.
  scheduledAt: z.iso.datetime().optional(),
  status: z.enum(DOSE_RESPONSES),
  note: text(500).optional(),
});
export type DoseInput = z.infer<typeof doseInputSchema>;

export const uuidSchema = z.uuid();

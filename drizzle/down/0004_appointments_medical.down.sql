ALTER TABLE "animals" ADD COLUMN "allergy_info" text;--> statement-breakpoint
UPDATE "animals" a SET "allergy_info" = r."titles" FROM (
  SELECT "animal_id", string_agg("title", E'\n' ORDER BY "created_at") AS "titles"
  FROM "medical_records" WHERE "imported_from_profile" GROUP BY "animal_id"
) r WHERE r."animal_id" = a."id";--> statement-breakpoint
DROP TABLE "reminders";--> statement-breakpoint
DROP TABLE "expenses";--> statement-breakpoint
DROP TABLE "medical_records";--> statement-breakpoint
DROP TABLE "appointments";--> statement-breakpoint
ALTER TABLE "households" DROP COLUMN "timezone";--> statement-breakpoint
DROP TYPE "public"."reminder_source";--> statement-breakpoint
DROP TYPE "public"."expense_category";--> statement-breakpoint
DROP TYPE "public"."medical_record_type";--> statement-breakpoint
DROP TYPE "public"."severity";--> statement-breakpoint
DROP TYPE "public"."appointment_type";
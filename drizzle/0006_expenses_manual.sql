-- A new enum value cannot be used in the transaction that adds it, so the type is swapped instead.
CREATE TYPE "public"."expense_category_new" AS ENUM('vet', 'food', 'insurance', 'grooming', 'toys', 'medication', 'training', 'other');--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "category" TYPE "public"."expense_category_new" USING "category"::text::"public"."expense_category_new";--> statement-breakpoint
DROP TYPE "public"."expense_category";--> statement-breakpoint
ALTER TYPE "public"."expense_category_new" RENAME TO "expense_category";--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "medication_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "food_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_medication_id_household_id_medications_id_household_id_fk" FOREIGN KEY ("medication_id","household_id") REFERENCES "public"."medications"("id","household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "expenses" SET "category" = 'training' WHERE "appointment_id" IN (SELECT "id" FROM "appointments" WHERE "type" = 'training');
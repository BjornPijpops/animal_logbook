ALTER TABLE "expenses" DROP CONSTRAINT "expenses_medication_id_household_id_medications_id_household_id_fk";--> statement-breakpoint
ALTER TABLE "expenses" DROP COLUMN "food_plan_id";--> statement-breakpoint
ALTER TABLE "expenses" DROP COLUMN "medication_id";--> statement-breakpoint
ALTER TABLE "expenses" DROP COLUMN "notes";--> statement-breakpoint
CREATE TYPE "public"."expense_category_old" AS ENUM('vet', 'food', 'insurance', 'grooming', 'toys', 'medication', 'other');--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "category" TYPE "public"."expense_category_old" USING (CASE WHEN "category"::text = 'training' THEN 'other' ELSE "category"::text END)::"public"."expense_category_old";--> statement-breakpoint
DROP TYPE "public"."expense_category";--> statement-breakpoint
ALTER TYPE "public"."expense_category_old" RENAME TO "expense_category";
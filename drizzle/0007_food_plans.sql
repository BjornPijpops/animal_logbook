CREATE TYPE "public"."food_type" AS ENUM('dry', 'wet', 'raw', 'treats', 'supplement', 'other');--> statement-breakpoint
CREATE TYPE "public"."food_unit" AS ENUM('g', 'ml', 'cups', 'pieces');--> statement-breakpoint
CREATE TABLE "food_meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"time_of_day" text NOT NULL,
	"amount_centi" integer NOT NULL,
	CONSTRAINT "food_meals_amount_check" CHECK ("food_meals"."amount_centi" > 0),
	CONSTRAINT "food_meals_time_check" CHECK ("food_meals"."time_of_day" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
CREATE TABLE "food_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"animal_id" uuid NOT NULL,
	"brand" text NOT NULL,
	"flavor" text,
	"type" "food_type" NOT NULL,
	"unit" "food_unit" NOT NULL,
	"started_on" date NOT NULL,
	"ended_on" date,
	"start_note" text,
	"end_note" text,
	"notes" text,
	"kcal_per_100g" integer,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_plans_id_household_key" UNIQUE("id","household_id"),
	CONSTRAINT "food_plans_dates_check" CHECK ("food_plans"."ended_on" is null or "food_plans"."ended_on" >= "food_plans"."started_on"),
	CONSTRAINT "food_plans_kcal_check" CHECK ("food_plans"."kcal_per_100g" is null or "food_plans"."kcal_per_100g" > 0)
);
--> statement-breakpoint
ALTER TABLE "food_meals" ADD CONSTRAINT "food_meals_plan_id_household_id_food_plans_id_household_id_fk" FOREIGN KEY ("plan_id","household_id") REFERENCES "public"."food_plans"("id","household_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_plans" ADD CONSTRAINT "food_plans_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_plans" ADD CONSTRAINT "food_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_plans" ADD CONSTRAINT "food_plans_animal_id_household_id_animals_id_household_id_fk" FOREIGN KEY ("animal_id","household_id") REFERENCES "public"."animals"("id","household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_meals_plan_idx" ON "food_meals" USING btree ("plan_id","time_of_day");--> statement-breakpoint
CREATE INDEX "food_plans_animal_idx" ON "food_plans" USING btree ("household_id","animal_id","started_on") WHERE "food_plans"."deleted_at" is null;--> statement-breakpoint
-- Phase 6 left food_plan_id without a foreign key, so any value in it is an orphan. Clear them before constraining.
UPDATE "expenses" SET "food_plan_id" = NULL WHERE "food_plan_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "food_plans" p WHERE p."id" = "expenses"."food_plan_id" AND p."household_id" = "expenses"."household_id");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_food_plan_id_household_id_food_plans_id_household_id_fk" FOREIGN KEY ("food_plan_id","household_id") REFERENCES "public"."food_plans"("id","household_id") ON DELETE no action ON UPDATE no action;
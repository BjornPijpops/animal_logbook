ALTER TABLE "expenses" DROP CONSTRAINT "expenses_food_plan_id_household_id_food_plans_id_household_id_fk";--> statement-breakpoint
DROP TABLE "food_meals";--> statement-breakpoint
DROP TABLE "food_plans";--> statement-breakpoint
DROP TYPE "public"."food_unit";--> statement-breakpoint
DROP TYPE "public"."food_type";
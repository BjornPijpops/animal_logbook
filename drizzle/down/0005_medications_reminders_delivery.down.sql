DROP TABLE "notification_preferences";--> statement-breakpoint
DROP TABLE "push_subscriptions";--> statement-breakpoint
DROP TABLE "notification_deliveries";--> statement-breakpoint
DROP TABLE "medication_doses";--> statement-breakpoint
DROP TABLE "medication_schedules";--> statement-breakpoint
DROP TABLE "medications";--> statement-breakpoint
DROP INDEX "reminders_due_idx";--> statement-breakpoint
ALTER TABLE "reminders" DROP COLUMN "expired_at";--> statement-breakpoint
CREATE INDEX "reminders_due_idx" ON "reminders" USING btree ("due_at") WHERE "reminders"."done_at" is null and "reminders"."cancelled_at" is null;--> statement-breakpoint
DROP TYPE "public"."delivery_status";--> statement-breakpoint
DROP TYPE "public"."dose_status";--> statement-breakpoint
DROP TYPE "public"."notification_channel";--> statement-breakpoint
DROP TYPE "public"."schedule_kind";
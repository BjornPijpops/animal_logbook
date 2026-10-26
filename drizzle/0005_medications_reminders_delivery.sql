CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."dose_status" AS ENUM('given', 'skipped', 'missed');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('push', 'email');--> statement-breakpoint
CREATE TYPE "public"."schedule_kind" AS ENUM('daily', 'weekdays', 'every_n_days', 'as_needed');--> statement-breakpoint
CREATE TABLE "medication_doses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"medication_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "dose_status" NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"logged_by" uuid,
	"note" text,
	CONSTRAINT "medication_doses_slot_key" UNIQUE("medication_id","scheduled_at")
);
--> statement-breakpoint
CREATE TABLE "medication_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"medication_id" uuid NOT NULL,
	"kind" "schedule_kind" NOT NULL,
	"times" text[] DEFAULT '{}'::text[] NOT NULL,
	"weekdays" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
	"interval_days" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medication_schedules_medication_key" UNIQUE("medication_id"),
	CONSTRAINT "medication_schedules_shape_check" CHECK (("medication_schedules"."kind" = 'as_needed' and cardinality("medication_schedules"."times") = 0)
        or ("medication_schedules"."kind" <> 'as_needed' and cardinality("medication_schedules"."times") between 1 and 12)),
	CONSTRAINT "medication_schedules_weekdays_check" CHECK (("medication_schedules"."kind" = 'weekdays') = (cardinality("medication_schedules"."weekdays") > 0)),
	CONSTRAINT "medication_schedules_interval_check" CHECK (("medication_schedules"."kind" = 'every_n_days') = ("medication_schedules"."interval_days" is not null)
        and ("medication_schedules"."interval_days" is null or "medication_schedules"."interval_days" between 2 and 365))
);
--> statement-breakpoint
CREATE TABLE "medications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"animal_id" uuid NOT NULL,
	"medical_record_id" uuid NOT NULL,
	"dosage" text NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medications_id_household_key" UNIQUE("id","household_id"),
	CONSTRAINT "medications_record_key" UNIQUE("medical_record_id")
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reminder_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_key" UNIQUE("reminder_id","user_id","channel")
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_channel_pk" PRIMARY KEY("user_id","channel")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE("endpoint")
);
--> statement-breakpoint
DROP INDEX "reminders_due_idx";--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "expired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "medication_doses" ADD CONSTRAINT "medication_doses_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_doses" ADD CONSTRAINT "medication_doses_logged_by_users_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_doses" ADD CONSTRAINT "medication_doses_medication_id_household_id_medications_id_household_id_fk" FOREIGN KEY ("medication_id","household_id") REFERENCES "public"."medications"("id","household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_schedules" ADD CONSTRAINT "medication_schedules_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_schedules" ADD CONSTRAINT "medication_schedules_medication_id_household_id_medications_id_household_id_fk" FOREIGN KEY ("medication_id","household_id") REFERENCES "public"."medications"("id","household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_animal_id_household_id_animals_id_household_id_fk" FOREIGN KEY ("animal_id","household_id") REFERENCES "public"."animals"("id","household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_medical_record_id_household_id_medical_records_id_household_id_fk" FOREIGN KEY ("medical_record_id","household_id") REFERENCES "public"."medical_records"("id","household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_reminder_id_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."reminders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "medication_doses_lookup_idx" ON "medication_doses" USING btree ("household_id","medication_id","scheduled_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "medications_animal_idx" ON "medications" USING btree ("household_id","animal_id") WHERE "medications"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "notification_deliveries_due_idx" ON "notification_deliveries" USING btree ("next_attempt_at") WHERE "notification_deliveries"."status" in ('pending', 'sending');--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reminders_due_idx" ON "reminders" USING btree ("due_at") WHERE "reminders"."done_at" is null and "reminders"."cancelled_at" is null and "reminders"."expired_at" is null;
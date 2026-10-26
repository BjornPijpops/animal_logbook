CREATE TYPE "public"."appointment_type" AS ENUM('vet', 'grooming', 'training', 'vaccination', 'medication');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('vet', 'food', 'insurance', 'grooming', 'toys', 'medication', 'other');--> statement-breakpoint
CREATE TYPE "public"."medical_record_type" AS ENUM('vaccination', 'surgery', 'illness', 'injury', 'allergy', 'medication');--> statement-breakpoint
CREATE TYPE "public"."reminder_source" AS ENUM('follow_up', 'vaccination_due', 'medication_dose', 'document_expiry', 'low_stock');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('mild', 'moderate', 'severe');--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"animal_id" uuid,
	"type" "appointment_type" NOT NULL,
	"title" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"cost_minor" integer,
	"currency" char(3),
	"notes" text,
	"follow_up_date" date,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_id_household_key" UNIQUE("id","household_id"),
	CONSTRAINT "appointments_cost_check" CHECK (("appointments"."cost_minor" is null) = ("appointments"."currency" is null) and ("appointments"."cost_minor" is null or "appointments"."cost_minor" >= 0))
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"animal_id" uuid,
	"category" "expense_category" NOT NULL,
	"incurred_on" date NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"description" text NOT NULL,
	"appointment_id" uuid,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_id_household_key" UNIQUE("id","household_id"),
	CONSTRAINT "expenses_appointment_key" UNIQUE("appointment_id"),
	CONSTRAINT "expenses_amount_check" CHECK ("expenses"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "medical_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"animal_id" uuid NOT NULL,
	"type" "medical_record_type" NOT NULL,
	"title" text NOT NULL,
	"started_on" date NOT NULL,
	"ended_on" date,
	"severity" "severity",
	"next_due_on" date,
	"notes" text,
	"appointment_id" uuid,
	"imported_from_profile" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medical_records_id_household_key" UNIQUE("id","household_id"),
	CONSTRAINT "medical_records_dates_check" CHECK ("medical_records"."ended_on" is null or "medical_records"."ended_on" >= "medical_records"."started_on"),
	CONSTRAINT "medical_records_typed_check" CHECK (("medical_records"."next_due_on" is null or "medical_records"."type" = 'vaccination')
        and ("medical_records"."severity" is null or "medical_records"."type" in ('illness', 'injury', 'allergy'))
        and ("medical_records"."ended_on" is null or "medical_records"."type" not in ('vaccination', 'surgery')))
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"source_type" "reminder_source" NOT NULL,
	"source_id" uuid NOT NULL,
	"animal_id" uuid,
	"title" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_source_due_key" UNIQUE("source_type","source_id","due_at")
);
--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
UPDATE "households" h SET "timezone" = u."timezone" FROM "users" u WHERE u."id" = h."created_by";--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_animal_id_household_id_animals_id_household_id_fk" FOREIGN KEY ("animal_id","household_id") REFERENCES "public"."animals"("id","household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_animal_id_household_id_animals_id_household_id_fk" FOREIGN KEY ("animal_id","household_id") REFERENCES "public"."animals"("id","household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_appointment_id_household_id_appointments_id_household_id_fk" FOREIGN KEY ("appointment_id","household_id") REFERENCES "public"."appointments"("id","household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_animal_id_household_id_animals_id_household_id_fk" FOREIGN KEY ("animal_id","household_id") REFERENCES "public"."animals"("id","household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_appointment_id_household_id_appointments_id_household_id_fk" FOREIGN KEY ("appointment_id","household_id") REFERENCES "public"."appointments"("id","household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_animal_id_household_id_animals_id_household_id_fk" FOREIGN KEY ("animal_id","household_id") REFERENCES "public"."animals"("id","household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_household_time_idx" ON "appointments" USING btree ("household_id","scheduled_at" DESC NULLS LAST) WHERE "appointments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "appointments_animal_time_idx" ON "appointments" USING btree ("household_id","animal_id","scheduled_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "expenses_household_date_idx" ON "expenses" USING btree ("household_id","incurred_on" DESC NULLS LAST) WHERE "expenses"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "medical_records_animal_idx" ON "medical_records" USING btree ("household_id","animal_id","started_on" DESC NULLS LAST) WHERE "medical_records"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "medical_records_appointment_idx" ON "medical_records" USING btree ("household_id","appointment_id");--> statement-breakpoint
CREATE INDEX "reminders_due_idx" ON "reminders" USING btree ("due_at") WHERE "reminders"."done_at" is null and "reminders"."cancelled_at" is null;--> statement-breakpoint
CREATE INDEX "reminders_source_idx" ON "reminders" USING btree ("household_id","source_type","source_id");--> statement-breakpoint
INSERT INTO "medical_records" ("household_id", "animal_id", "type", "title", "started_on", "imported_from_profile")
SELECT "household_id", "id", 'allergy', btrim("allergy_info"), "created_at"::date, true FROM "animals" WHERE btrim(coalesce("allergy_info", '')) <> '';--> statement-breakpoint
ALTER TABLE "animals" DROP COLUMN "allergy_info";
CREATE TYPE "public"."attachment_owner_type" AS ENUM('document', 'appointment', 'medical_record', 'expense');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('registration', 'vaccination', 'insurance', 'invoice', 'passport', 'other');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"owner_type" "attachment_owner_type" NOT NULL,
	"owner_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "attachments_file_key" UNIQUE("file_id")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"animal_id" uuid,
	"type" "document_type" NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"expires_on" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "documents_id_household_key" UNIQUE("id","household_id")
);
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "original_name" text;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_file_id_household_id_files_id_household_id_fk" FOREIGN KEY ("file_id","household_id") REFERENCES "public"."files"("id","household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_animal_id_household_id_animals_id_household_id_fk" FOREIGN KEY ("animal_id","household_id") REFERENCES "public"."animals"("id","household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_owner_idx" ON "attachments" USING btree ("household_id","owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "documents_household_created_idx" ON "documents" USING btree ("household_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "documents_animal_idx" ON "documents" USING btree ("household_id","animal_id");--> statement-breakpoint
CREATE INDEX "documents_expiry_idx" ON "documents" USING btree ("household_id","expires_on") WHERE "documents"."expires_on" is not null and "documents"."deleted_at" is null;
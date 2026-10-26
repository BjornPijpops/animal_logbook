CREATE TYPE "public"."animal_gender" AS ENUM('male', 'female', 'unknown');--> statement-breakpoint
CREATE TABLE "animal_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"animal_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"thumb_file_id" uuid NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "animals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"species" text NOT NULL,
	"species_other" text,
	"breed" text,
	"gender" "animal_gender" DEFAULT 'unknown' NOT NULL,
	"birth_date" date,
	"birth_date_is_estimate" boolean DEFAULT false NOT NULL,
	"color_markings" text,
	"chip_number" text,
	"registration_number" text,
	"sterilized" boolean,
	"allergy_info" text,
	"emergency_notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "animals_id_household_key" UNIQUE("id","household_id"),
	CONSTRAINT "animals_species_other_check" CHECK ("animals"."species" <> 'other' or length(btrim(coalesce("animals"."species_other", ''))) > 0)
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum_sha256" char(64) NOT NULL,
	"uploaded_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "files_id_household_key" UNIQUE("id","household_id")
);
--> statement-breakpoint
CREATE TABLE "weight_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"animal_id" uuid NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	"weight_grams" integer NOT NULL,
	"note" text,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weight_entries_positive" CHECK ("weight_entries"."weight_grams" > 0)
);
--> statement-breakpoint
ALTER TABLE "animal_photos" ADD CONSTRAINT "animal_photos_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_photos" ADD CONSTRAINT "animal_photos_animal_id_household_id_animals_id_household_id_fk" FOREIGN KEY ("animal_id","household_id") REFERENCES "public"."animals"("id","household_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_photos" ADD CONSTRAINT "animal_photos_file_id_household_id_files_id_household_id_fk" FOREIGN KEY ("file_id","household_id") REFERENCES "public"."files"("id","household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_photos" ADD CONSTRAINT "animal_photos_thumb_file_id_household_id_files_id_household_id_fk" FOREIGN KEY ("thumb_file_id","household_id") REFERENCES "public"."files"("id","household_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_animal_id_household_id_animals_id_household_id_fk" FOREIGN KEY ("animal_id","household_id") REFERENCES "public"."animals"("id","household_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "animal_photos_primary_key" ON "animal_photos" USING btree ("animal_id") WHERE "animal_photos"."is_primary" and "animal_photos"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "animal_photos_animal_idx" ON "animal_photos" USING btree ("animal_id","created_at");--> statement-breakpoint
CREATE INDEX "animals_household_idx" ON "animals" USING btree ("household_id","deleted_at","name");--> statement-breakpoint
CREATE INDEX "weight_entries_animal_idx" ON "weight_entries" USING btree ("animal_id","measured_at" DESC NULLS LAST);
DROP TABLE "attachments";--> statement-breakpoint
DROP TABLE "documents";--> statement-breakpoint
ALTER TABLE "files" DROP COLUMN "original_name";--> statement-breakpoint
DROP TYPE "public"."attachment_owner_type";--> statement-breakpoint
DROP TYPE "public"."document_type";
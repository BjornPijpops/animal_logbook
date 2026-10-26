DROP INDEX "users_deletion_pending_idx";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "deletion_requested_at";
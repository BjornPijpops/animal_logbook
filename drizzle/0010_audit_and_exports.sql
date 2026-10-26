CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"target_user_id" uuid,
	"event" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_event_check" CHECK ("audit_log"."event" in ('invite_sent', 'invite_revoked', 'invite_accepted', 'member_removed', 'member_left', 'role_changed', 'ownership_transferred', 'export_requested', 'export_downloaded', 'account_deletion_requested', 'account_deleted', 'reauth_failed'))
);
--> statement-breakpoint
CREATE TABLE "data_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"storage_key" text,
	"size_bytes" integer,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "data_exports_status_check" CHECK ("data_exports"."status" in ('pending', 'processing', 'ready', 'failed', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_household_created_idx" ON "audit_log" USING btree ("household_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "data_exports_user_idx" ON "data_exports" USING btree ("user_id","requested_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "data_exports_status_idx" ON "data_exports" USING btree ("status");
--> statement-breakpoint
CREATE FUNCTION app_is_owner() RETURNS boolean LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM household_members m
    WHERE m.household_id = app_household_id() AND m.user_id = app_user_id() AND m.role = 'owner'
  );
END $$;
--> statement-breakpoint
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_log_app_select ON audit_log FOR SELECT TO animal_app USING (household_id = app_household_id() AND app_is_owner());
--> statement-breakpoint
CREATE POLICY audit_log_app_insert ON audit_log FOR INSERT TO animal_app WITH CHECK (household_id = app_household_id() AND app_is_member() AND actor_user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY audit_log_worker ON audit_log TO animal_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE data_exports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE data_exports FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY data_exports_app_select ON data_exports FOR SELECT TO animal_app USING (user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY data_exports_app_insert ON data_exports FOR INSERT TO animal_app WITH CHECK (user_id = app_user_id() AND household_id = app_household_id() AND app_is_owner());
--> statement-breakpoint
CREATE POLICY data_exports_worker ON data_exports TO animal_worker USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY household_invites_own_select ON household_invites FOR SELECT TO animal_app USING (lower(email) = lower((SELECT u.email FROM users u WHERE u.id = app_user_id())));
--> statement-breakpoint
CREATE POLICY household_invites_own_delete ON household_invites FOR DELETE TO animal_app USING (lower(email) = lower((SELECT u.email FROM users u WHERE u.id = app_user_id())));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'animal_app') THEN CREATE ROLE animal_app NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'animal_worker') THEN CREATE ROLE animal_worker NOLOGIN; END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO animal_app, animal_worker;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO animal_app, animal_worker;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO animal_app, animal_worker;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO animal_app, animal_worker;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO animal_app, animal_worker;
--> statement-breakpoint
REVOKE ALL ON sessions, accounts, verifications FROM animal_worker;
--> statement-breakpoint
CREATE FUNCTION app_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION app_household_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.household_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION app_invite_hash() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.invite_token_hash', true), '') $$;
--> statement-breakpoint
CREATE FUNCTION app_is_member() RETURNS boolean LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM household_members m
    WHERE m.household_id = app_household_id() AND m.user_id = app_user_id()
  );
END $$;
--> statement-breakpoint
ALTER TABLE animal_photos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE animal_photos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY animal_photos_app ON animal_photos TO animal_app USING (household_id = app_household_id() AND app_is_member()) WITH CHECK (household_id = app_household_id() AND app_is_member());
--> statement-breakpoint
CREATE POLICY animal_photos_worker ON animal_photos TO animal_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE animals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE animals FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY animals_app ON animals TO animal_app USING (household_id = app_household_id() AND app_is_member()) WITH CHECK (household_id = app_household_id() AND app_is_member());
--> statement-breakpoint
CREATE POLICY animals_worker ON animals TO animal_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY appointments_app ON appointments TO animal_app USING (household_id = app_household_id() AND app_is_member()) WITH CHECK (household_id = app_household_id() AND app_is_member());
--> statement-breakpoint
CREATE POLICY appointments_worker ON appointments TO animal_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE attachments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY attachments_app ON attachments TO animal_app USING (household_id = app_household_id() AND app_is_member()) WITH CHECK (household_id = app_household_id() AND app_is_member());
--> statement-breakpoint
CREATE POLICY attachments_worker ON attachments TO animal_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY documents_app ON documents TO animal_app USING (household_id = app_household_id() AND app_is_member()) WITH CHECK (household_id = app_household_id() AND app_is_member());
--> statement-breakpoint
CREATE POLICY documents_worker ON documents TO animal_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE expenses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY expenses_app ON expenses TO animal_app USING (household_id = app_household_id() AND app_is_member()) WITH CHECK (household_id = app_household_id() AND app_is_member());
--> statement-breakpoint
CREATE POLICY expenses_worker ON expenses TO animal_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE files FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY files_app ON files TO animal_app USING (household_id = app_household_id() AND app_is_member()) WITH CHECK (household_id = app_household_id() AND app_is_member());
--> statement-breakpoint
CREATE POLICY files_worker ON files TO animal_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE food_meals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE food_meals FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY food_meals_app ON food_meals TO animal_app USING (household_id = app_household_id() AND app_is_member()) WITH CHECK (household_id = app_household_id() AND app_is_member());
--> statement-breakpoint
CREATE POLICY food_meals_worker ON food_meals TO animal_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE food_plans ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE food_plans FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY food_plans_app ON food_plans TO animal_app USING (household_id = app_household_id() AND app_is_member()) WITH CHECK (household_id = app_household_id() AND app_is_member());
--> statement-breakpoint
CREATE POLICY food_plans_worker ON food_plans TO animal_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE medical_records FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY medical_records_app ON medical_records TO animal_app USING (household_id = app_household_id() AND app_is_member()) WITH CHECK (household_id = app_household_id() AND app_is_member());
--> statement-breakpoint
CREATE POLICY medical_records_worker ON medical_records TO animal_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE medication_doses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE medication_doses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY medication_doses_app ON medication_doses TO animal_app USING (household_id = app_household_id() AND app_is_member()) WITH CHECK (household_id = app_household_id() AND app_is_member());
--> statement-breakpoint
CREATE POLICY medication_doses_worker ON medication_doses TO animal_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE medication_schedules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE medication_schedules FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY medication_schedules_app ON medication_schedules TO animal_app USING (household_id = app_household_id() AND app_is_member()) WITH CHECK (household_id = app_household_id() AND app_is_member());
--> statement-breakpoint
CREATE POLICY medication_schedules_worker ON medication_schedules TO animal_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE medications FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY medications_app ON medications TO animal_app USING (household_id = app_household_id() AND app_is_member()) WITH CHECK (household_id = app_household_id() AND app_is_member());
--> statement-breakpoint
CREATE POLICY medications_worker ON medications TO animal_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE reminders FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY reminders_app ON reminders TO animal_app USING (household_id = app_household_id() AND app_is_member()) WITH CHECK (household_id = app_household_id() AND app_is_member());
--> statement-breakpoint
CREATE POLICY reminders_worker ON reminders TO animal_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE weight_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE weight_entries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY weight_entries_app ON weight_entries TO animal_app USING (household_id = app_household_id() AND app_is_member()) WITH CHECK (household_id = app_household_id() AND app_is_member());
--> statement-breakpoint
CREATE POLICY weight_entries_worker ON weight_entries TO animal_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification_deliveries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY notification_deliveries_app ON notification_deliveries TO animal_app USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY notification_deliveries_worker ON notification_deliveries TO animal_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY notification_preferences_app ON notification_preferences TO animal_app USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY notification_preferences_worker ON notification_preferences TO animal_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY push_subscriptions_app ON push_subscriptions TO animal_app USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY push_subscriptions_worker ON push_subscriptions TO animal_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE households FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY households_worker ON households TO animal_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE household_members FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY household_members_worker ON household_members TO animal_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
ALTER TABLE household_invites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE household_invites FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY household_invites_worker ON household_invites TO animal_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY households_select ON households FOR SELECT TO animal_app USING (created_by = app_user_id() OR id IN (SELECT household_id FROM household_members WHERE user_id = app_user_id()));
--> statement-breakpoint
CREATE POLICY households_insert ON households FOR INSERT TO animal_app WITH CHECK (created_by = app_user_id() AND id = app_household_id());
--> statement-breakpoint
CREATE POLICY households_update ON households FOR UPDATE TO animal_app USING (id = app_household_id() AND app_is_member()) WITH CHECK (id = app_household_id() AND app_is_member());
--> statement-breakpoint
CREATE POLICY households_delete ON households FOR DELETE TO animal_app USING (id = app_household_id() AND app_is_member());
--> statement-breakpoint
CREATE POLICY household_members_select ON household_members FOR SELECT TO animal_app USING (user_id = app_user_id() OR household_id = app_household_id());
--> statement-breakpoint
CREATE POLICY household_members_insert ON household_members FOR INSERT TO animal_app WITH CHECK (
  user_id = app_user_id() AND household_id = app_household_id() AND (
    (role = 'owner' AND EXISTS (SELECT 1 FROM households h WHERE h.id = household_id AND h.created_by = app_user_id()))
    OR EXISTS (
      SELECT 1 FROM household_invites i
      WHERE i.token_hash = app_invite_hash() AND i.household_id = household_members.household_id
        AND i.role = household_members.role AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
    )
  )
);
--> statement-breakpoint
CREATE POLICY household_members_update ON household_members FOR UPDATE TO animal_app USING (household_id = app_household_id() AND app_is_member()) WITH CHECK (household_id = app_household_id() AND app_is_member());
--> statement-breakpoint
CREATE POLICY household_members_delete ON household_members FOR DELETE TO animal_app USING (user_id = app_user_id() OR (household_id = app_household_id() AND app_is_member()));
--> statement-breakpoint
CREATE POLICY household_invites_app ON household_invites TO animal_app USING ((household_id = app_household_id() AND app_is_member()) OR token_hash = app_invite_hash()) WITH CHECK ((household_id = app_household_id() AND app_is_member()) OR token_hash = app_invite_hash());

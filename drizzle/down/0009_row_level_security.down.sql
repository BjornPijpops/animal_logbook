ALTER TABLE animal_photos NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE animal_photos DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE animals NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE animals DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE appointments NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE appointments DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE attachments NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE attachments DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE documents NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE expenses NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE files NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE files DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE food_meals NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE food_meals DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE food_plans NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE food_plans DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE medical_records NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE medical_records DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE medication_doses NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE medication_doses DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE medication_schedules NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE medication_schedules DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE medications NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE medications DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE reminders NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE reminders DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE weight_entries NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE weight_entries DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification_deliveries NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification_deliveries DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification_preferences NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notification_preferences DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE push_subscriptions NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE push_subscriptions DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE households NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE households DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE household_members NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE household_members DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE household_invites NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE household_invites DISABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY animal_photos_app ON animal_photos;
--> statement-breakpoint
DROP POLICY animal_photos_worker ON animal_photos;
--> statement-breakpoint
DROP POLICY animals_app ON animals;
--> statement-breakpoint
DROP POLICY animals_worker ON animals;
--> statement-breakpoint
DROP POLICY appointments_app ON appointments;
--> statement-breakpoint
DROP POLICY appointments_worker ON appointments;
--> statement-breakpoint
DROP POLICY attachments_app ON attachments;
--> statement-breakpoint
DROP POLICY attachments_worker ON attachments;
--> statement-breakpoint
DROP POLICY documents_app ON documents;
--> statement-breakpoint
DROP POLICY documents_worker ON documents;
--> statement-breakpoint
DROP POLICY expenses_app ON expenses;
--> statement-breakpoint
DROP POLICY expenses_worker ON expenses;
--> statement-breakpoint
DROP POLICY files_app ON files;
--> statement-breakpoint
DROP POLICY files_worker ON files;
--> statement-breakpoint
DROP POLICY food_meals_app ON food_meals;
--> statement-breakpoint
DROP POLICY food_meals_worker ON food_meals;
--> statement-breakpoint
DROP POLICY food_plans_app ON food_plans;
--> statement-breakpoint
DROP POLICY food_plans_worker ON food_plans;
--> statement-breakpoint
DROP POLICY medical_records_app ON medical_records;
--> statement-breakpoint
DROP POLICY medical_records_worker ON medical_records;
--> statement-breakpoint
DROP POLICY medication_doses_app ON medication_doses;
--> statement-breakpoint
DROP POLICY medication_doses_worker ON medication_doses;
--> statement-breakpoint
DROP POLICY medication_schedules_app ON medication_schedules;
--> statement-breakpoint
DROP POLICY medication_schedules_worker ON medication_schedules;
--> statement-breakpoint
DROP POLICY medications_app ON medications;
--> statement-breakpoint
DROP POLICY medications_worker ON medications;
--> statement-breakpoint
DROP POLICY reminders_app ON reminders;
--> statement-breakpoint
DROP POLICY reminders_worker ON reminders;
--> statement-breakpoint
DROP POLICY weight_entries_app ON weight_entries;
--> statement-breakpoint
DROP POLICY weight_entries_worker ON weight_entries;
--> statement-breakpoint
DROP POLICY notification_deliveries_app ON notification_deliveries;
--> statement-breakpoint
DROP POLICY notification_deliveries_worker ON notification_deliveries;
--> statement-breakpoint
DROP POLICY notification_preferences_app ON notification_preferences;
--> statement-breakpoint
DROP POLICY notification_preferences_worker ON notification_preferences;
--> statement-breakpoint
DROP POLICY push_subscriptions_app ON push_subscriptions;
--> statement-breakpoint
DROP POLICY push_subscriptions_worker ON push_subscriptions;
--> statement-breakpoint
DROP POLICY households_select ON households;
--> statement-breakpoint
DROP POLICY households_insert ON households;
--> statement-breakpoint
DROP POLICY households_update ON households;
--> statement-breakpoint
DROP POLICY households_delete ON households;
--> statement-breakpoint
DROP POLICY households_worker ON households;
--> statement-breakpoint
DROP POLICY household_members_select ON household_members;
--> statement-breakpoint
DROP POLICY household_members_insert ON household_members;
--> statement-breakpoint
DROP POLICY household_members_update ON household_members;
--> statement-breakpoint
DROP POLICY household_members_delete ON household_members;
--> statement-breakpoint
DROP POLICY household_members_worker ON household_members;
--> statement-breakpoint
DROP POLICY household_invites_app ON household_invites;
--> statement-breakpoint
DROP POLICY household_invites_worker ON household_invites;
--> statement-breakpoint
DROP FUNCTION app_is_member();
--> statement-breakpoint
DROP FUNCTION app_invite_hash();
--> statement-breakpoint
DROP FUNCTION app_household_id();
--> statement-breakpoint
DROP FUNCTION app_user_id();
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM animal_app, animal_worker;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM animal_app, animal_worker;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM animal_app, animal_worker;
--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM animal_app, animal_worker;
--> statement-breakpoint
REVOKE USAGE ON SCHEMA public FROM animal_app, animal_worker;

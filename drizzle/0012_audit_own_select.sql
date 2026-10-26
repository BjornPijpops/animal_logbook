-- A member may read the audit entries that name them as actor or target (personal data export).
-- Household owners keep reading the whole household log through audit_log_app_select.
CREATE POLICY audit_log_own_select ON audit_log FOR SELECT TO animal_app USING (actor_user_id = app_user_id() OR target_user_id = app_user_id());
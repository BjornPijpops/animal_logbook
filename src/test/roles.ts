// Roles are cluster-wide, so tests and the dev database share them and must agree on passwords.
export const TEST_APP_PASSWORD = process.env.APP_DB_PASSWORD ?? "animal_app";
export const TEST_WORKER_PASSWORD = process.env.WORKER_DB_PASSWORD ?? "animal_worker";

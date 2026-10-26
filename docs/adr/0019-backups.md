# 0019. Backups and restore

Status: accepted (Phase 8c).

## Decisions

1. **What is backed up.** One archive per run (`animal-logbook-<UTC time>.tar`): a `pg_dump -Fc` as the owner role (includes RLS policies, grants and the pg-boss schema), a tarball of the uploads volume, `counts.txt` (row counts of key tables) and `uploads.sha256` (a checksum for every file). Exports are not backed up: they expire after 24 hours.
2. **Everything runs through Docker.** Dump and restore use `docker compose exec` into the Postgres container, and the volume is read through a throwaway container of the already pinned Postgres image. Nothing but Docker is needed on the host, and it works on Linux, macOS and Windows. The bash and PowerShell versions have the same behaviour and variables.
3. **Retention** is a simple age cut-off (`BACKUP_KEEP_DAYS`, default 14) applied to the backup directory after a successful run.
4. **Encryption.** Optional `age` or `gpg` encryption built into the scripts. The keys must live off the server. Plain archives are written with mode 600.
5. **Restore.** Starts Postgres, runs `migrate` (so the roles exist on a fresh server and the schema is current), then `pg_restore --clean --if-exists --no-owner --single-transaction`, replaces the uploads volume, then verifies row counts and every file checksum against the archive before starting the stack. It stops web, worker and Caddy first and requires `--yes`.
6. **Restore drill.** `deploy/restore-drill.*` creates data through the real app in a throwaway project, backs up, deletes all volumes, restores and compares counts and file counts. CI runs it on every push, so a change that breaks backups or restores fails the build.
7. **Same-disk warning.** The guide states plainly that a backup on the same disk is not a backup and recommends copying archives elsewhere (rsync, rclone, syncthing) and keeping one copy off-site.

## Known limits

- Point-in-time recovery (WAL archiving) is not provided; the recovery point is the last backup. Add `pg_basebackup` + WAL archiving if that is not enough.
- The dump is taken online (consistent snapshot) but the uploads archive is not atomic with it; a file uploaded in between can be present without its row or the other way round. The stray-file sweep removes orphaned files; for a strictly consistent pair, stop `web` and `worker` during the backup.
- Backups made with older application versions restore into the same version or newer; run the upgrade procedure afterwards.

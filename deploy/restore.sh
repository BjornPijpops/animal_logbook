#!/usr/bin/env bash
# Restores an archive made by backup.sh into the running (or freshly created) stack, then verifies it.
#   ENV_FILE=... ./deploy/restore.sh <archive> --yes
# Replaces the current database and uploads. Encrypted archives need BACKUP_AGE_IDENTITY (age key
# file) or a gpg key in your keyring. Stops web/worker/caddy during the restore.
cd "$(dirname "$0")/.."
source deploy/lib.sh

archive="${1:?Usage: restore.sh <archive> --yes}"
[ "${2:-}" = "--yes" ] || { echo "This replaces the current data. Re-run with --yes." >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
case "$archive" in
  *.age) age -d -i "${BACKUP_AGE_IDENTITY:?Set BACKUP_AGE_IDENTITY}" -o "$work/backup.tar" "$archive" ;;
  *.gpg) gpg --batch --yes --decrypt --output "$work/backup.tar" "$archive" ;;
  *) cp "$archive" "$work/backup.tar" ;;
esac
tar -xf "$work/backup.tar" -C "$work"

echo "Starting postgres and preparing roles ..."
dc up -d --wait postgres
dc up --no-start web worker
dc stop caddy web worker 2>/dev/null || true
dc run --rm migrate

echo "Restoring database ..."
pg="$(dc ps -q postgres)"
docker cp "$work/db.dump" "$pg:/tmp/db.dump"
dc exec -T postgres pg_restore -U "$DB_OWNER" -d "$DB_NAME" --clean --if-exists --no-owner --single-transaction /tmp/db.dump
dc exec -T postgres rm -f /tmp/db.dump

echo "Restoring uploads ..."
docker run --rm -v "${PROJECT}_uploads:/data" -v "$work:/in:ro" "$HELPER_IMAGE" \
  sh -c 'find /data -mindepth 1 -delete && tar xzf /in/uploads.tgz -C /data && chown -R 1000:1000 /data'

echo "Verifying ..."
fail=0
diff <(sort "$work/counts.txt") <(row_counts | sort) >/dev/null || { echo "FAIL: row counts differ from the backup"; fail=1; }
diff "$work/uploads.sha256" <(upload_checksums) >/dev/null || { echo "FAIL: uploaded file checksums differ"; fail=1; }
[ "$fail" = 0 ] || exit 1
echo "OK: row counts and $(wc -l < "$work/uploads.sha256" | tr -d ' ') file checksums match the backup."

dc up -d --wait
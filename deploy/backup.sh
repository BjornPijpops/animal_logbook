#!/usr/bin/env bash
# Backs up the database (pg_dump, owner role) and the uploads volume into one timestamped archive.
#   ENV_FILE=/etc/animal-logbook/.env.production ./deploy/backup.sh
# Optional: BACKUP_DIR, BACKUP_KEEP_DAYS (default 14), BACKUP_AGE_RECIPIENT or BACKUP_GPG_RECIPIENT
# to encrypt the archive. See docs/DEPLOYMENT.md. A backup on the same disk is not a real backup.
cd "$(dirname "$0")/.."
source deploy/lib.sh

mkdir -p "$BACKUP_DIR"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "Dumping database ..."
pg="$(dc ps -q postgres)"
dc exec -T postgres pg_dump -U "$DB_OWNER" -d "$DB_NAME" -Fc -f /tmp/db.dump
docker cp "$pg:/tmp/db.dump" "$work/db.dump"
dc exec -T postgres rm -f /tmp/db.dump
row_counts > "$work/counts.txt"

echo "Archiving uploads ..."
docker run --rm -v "${PROJECT}_uploads:/data:ro" -v "$work:/out" "$HELPER_IMAGE" \
  sh -c 'cd /data && tar czf /out/uploads.tgz .'
upload_checksums > "$work/uploads.sha256"

archive="$BACKUP_DIR/animal-logbook-$stamp.tar"
tar -cf "$archive" -C "$work" db.dump counts.txt uploads.tgz uploads.sha256
chmod 600 "$archive"

if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
  age -r "$BACKUP_AGE_RECIPIENT" -o "$archive.age" "$archive" && rm "$archive"
  archive="$archive.age"
elif [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then
  gpg --batch --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" --output "$archive.gpg" "$archive" && rm "$archive"
  archive="$archive.gpg"
fi

find "$BACKUP_DIR" -maxdepth 1 -name 'animal-logbook-*.tar*' -mtime +"$KEEP_DAYS" -delete
echo "Backup written: $archive"
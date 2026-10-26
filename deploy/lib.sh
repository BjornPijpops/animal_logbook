# Shared by backup.sh, restore.sh and restore-drill.sh. Sourced, not executed.
set -euo pipefail

ENV_FILE="${ENV_FILE:?Set ENV_FILE to the path of your .env.production}"
PROJECT="${COMPOSE_PROJECT:-animal-logbook-prod}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
HELPER_IMAGE="${BACKUP_HELPER_IMAGE:-postgres:17.7-alpine3.22}"
DB_NAME=animal_logbook
DB_OWNER=animal_owner

COMPOSE_ARGS=(-p "$PROJECT" --env-file "$ENV_FILE")
for f in ${COMPOSE_FILES:-docker-compose.prod.yml}; do COMPOSE_ARGS+=(-f "$f"); done
dc() { docker compose "${COMPOSE_ARGS[@]}" "$@"; }

COUNT_SQL="select 'users', count(*) from users union all select 'households', count(*) from households
union all select 'household_members', count(*) from household_members union all select 'animals', count(*) from animals
union all select 'documents', count(*) from documents union all select 'appointments', count(*) from appointments
union all select 'expenses', count(*) from expenses union all select 'medical_records', count(*) from medical_records
order by 1"

row_counts() { dc exec -T postgres psql -U "$DB_OWNER" -d "$DB_NAME" -Atc "$COUNT_SQL"; }

# Prints "<sha256>  <path>" for every file in the uploads volume, sorted by path.
upload_checksums() {
  docker run --rm -v "${PROJECT}_uploads:/data:ro" "$HELPER_IMAGE" \
    sh -c 'cd /data && find . -type f -exec sha256sum {} + | sort -k2'
}
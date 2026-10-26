#!/usr/bin/env bash
# Proves backups work: brings up a throwaway stack (project animal-logbook-drill, test credentials),
# creates data through the real app, backs up, wipes every volume, restores, and checks the data is back.
#   ./deploy/restore-drill.sh        (needs Docker, Node and the repo dependencies; run from the repo root)
cd "$(dirname "$0")/.."
export ENV_FILE=docker/e2e.env COMPOSE_PROJECT=animal-logbook-drill
export COMPOSE_FILES="docker-compose.prod.yml docker-compose.e2e.yml"
export BACKUP_DIR="${BACKUP_DIR:-$(mktemp -d)}"
source deploy/lib.sh

echo "== up"; build=(); [ -n "${APP_IMAGE:-}" ] || build=(--build)
dc up -d --wait --wait-timeout 240 "${build[@]}"
echo "== create data through the app"
E2E_KEEP=1 E2E_PROJECT="$PROJECT" node scripts/e2e-image.mjs e2e/animals.spec.ts --workers=1
before="$(row_counts)"; echo "$before"
files_before="$(upload_checksums | wc -l | tr -d ' ')"
[ "$files_before" -gt 0 ] || { echo "FAIL: the seed run stored no files"; exit 1; }

echo "== backup"; ./deploy/backup.sh
archive="$(ls "$BACKUP_DIR"/animal-logbook-*.tar | head -n1)"

echo "== wipe everything"; dc down -v --remove-orphans

echo "== restore"; ./deploy/restore.sh "$archive" --yes
[ "$(row_counts)" = "$before" ] || { echo "FAIL: counts differ after restore"; exit 1; }
[ "$(upload_checksums | wc -l | tr -d ' ')" = "$files_before" ] || { echo "FAIL: file count differs"; exit 1; }
curl -sk --resolve logbook.localhost:8443:127.0.0.1 https://logbook.localhost:8443/api/health/ready | grep -q '"ok"'
echo "== drill passed"; dc down -v --remove-orphans
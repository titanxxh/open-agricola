#!/usr/bin/env bash
# Maintainer-only: a planned single-host maintenance deployment. Never run in CI.
set -euo pipefail
# Defaults follow the owner-controlled Seoul deployment; no privilege escalation.
HOST="${1:-ubuntu@ten-kr}"
[[ "$HOST" == *@* ]] || HOST="ubuntu@$HOST"
REF="${2:-main}"
REMOTE_DIR="${3:-/home/ubuntu/open-agricola}"
REMOTE_ENV=()
if [[ -n "${ACCOUNT_REGISTRATION_POLICY:-}" ]]; then
  REMOTE_ENV+=(ACCOUNT_REGISTRATION_POLICY="$ACCOUNT_REGISTRATION_POLICY")
fi
REMOTE_ARGS=(env "${REMOTE_ENV[@]}" bash -s "$REMOTE_DIR" "$REF")
printf -v REMOTE_COMMAND '%q ' "${REMOTE_ARGS[@]}"
ssh "$HOST" "$REMOTE_COMMAND" <<'REMOTE'
set -euo pipefail
# Parse the complete function before detaching stdin from the SSH script.
deploy_backend() {
cd "$1"
REF="$2"
export APP_UID="$(id -u)" APP_GID="$(id -g)"
umask 077
mkdir -p backups
exec 9>backups/.maintenance.lock
flock -w 1800 9
# Keep local operator configuration and refuse to overwrite tracked edits.
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || { echo 'Tracked local edits must be resolved before deployment'; exit 1; }
PREVIOUS_REF="$(git rev-parse HEAD)"
git fetch origin "$REF"
TARGET_REF="$(git rev-parse FETCH_HEAD)"
git checkout --detach "$TARGET_REF"
# Bootstrap host dependencies without requiring any external service account.
# Node 24.15+ and pnpm are deployment-host prerequisites, as in local development.
pnpm install --frozen-lockfile
node --env-file=.env scripts/local-services.mjs
export GAME_BUILD_ID="$TARGET_REF"
COMPOSE=(docker compose -f docker-compose.prod.yml)
"${COMPOSE[@]}" build app
OLD_CONTAINER="$("${COMPOSE[@]}" ps -q app)"
SOURCE_BUILD_ID="$PREVIOUS_REF"
if [[ -n "$OLD_CONTAINER" ]]; then
  SOURCE_BUILD_ID="$(docker exec "$OLD_CONTAINER" node -p 'process.env.GAME_BUILD_ID' 2>/dev/null || printf '%s' "$PREVIOUS_REF")"
fi
export SOURCE_BUILD_ID
RESTART_OLD=0
cleanup() {
  if [[ "$RESTART_OLD" == 1 && -n "$OLD_CONTAINER" ]]; then
    echo 'Preflight failed; restarting the unchanged source application'
    docker start "$OLD_CONTAINER" || true
  fi
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
# The first SQLite -> PostgreSQL cutover is a separately documented controlled
# import, not an automatic empty-database launch over existing recorded games.
if [[ ! -f data/postgres-cutover.validated ]]; then
  echo 'Complete the controlled SQLite import (or explicitly validate a new empty installation) and create data/postgres-cutover.validated first.'
  exit 1
fi
if [[ -n "$OLD_CONTAINER" ]]; then RESTART_OLD=1; "${COMPOSE[@]}" stop app; fi
STEM="pre-${TARGET_REF:0:12}-$(date -u +%Y%m%dT%H%M%SZ)"
MAINTENANCE_LOCK_HELD=1 bash scripts/backup-storage.sh "$STEM" --already-stopped
# Only after the target image restored and checked a copy may it touch live data.
# Once live migration begins, a failure leaves maintenance active; never resume
# the old executable blindly against a possibly changed schema.
RESTART_OLD=0
"${COMPOSE[@]}" run --rm --no-deps app node --import tsx scripts/storage-archive-cli.ts \
  check-live "$TARGET_REF" --applications-stopped
"${COMPOSE[@]}" up -d --remove-orphans --no-build --wait --wait-timeout 120 app caddy prometheus grafana node-exporter
printf '%s\n' "$TARGET_REF" > data/deployed-build-id
printf 'Previous build: %s\nCurrent build: %s\n' "$PREVIOUS_REF" "$TARGET_REF"
# Pre-deploy archives: newest 5, and never beyond the 30-day retention bound.
{
  find backups -maxdepth 1 -name 'pre-*.tgz' -printf '%T@ %p\n' | sort -nr | tail -n +6 | cut -d ' ' -f 2-
  find backups -maxdepth 1 -name 'pre-*.tgz' -mmin +43200
} | sort -u | while IFS= read -r old; do
  stem="$(basename "$old" .tgz)"
  rm -f -- "$old" "backups/$stem.manifest.json" "backups/env-$stem"
done
echo 'Backend maintenance deployment and target-build validation completed.'
}
deploy_backend "$@" < /dev/null
REMOTE

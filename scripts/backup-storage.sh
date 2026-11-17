#!/usr/bin/env bash
# Online by default; deployment callers explicitly own the maintenance stop.
set -euo pipefail
POLICY_ROOT="${BACKUP_POLICY_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "${BACKUP_WORKING_DIRECTORY:-$POLICY_ROOT}"
source "$POLICY_ROOT/scripts/backup-process.sh"
MODE=online
if [[ "${2:-}" == --already-stopped ]]; then MODE=maintenance
elif [[ -n "${2:-}" ]]; then echo 'Unknown backup mode' >&2; exit 1; fi
# Online validation shares the host with players and stays single-threaded;
# a stopped stable deployment may use every CPU for restore validation.
if [[ "$MODE" == maintenance && "${BACKUP_ENVIRONMENT:-stable}" == stable ]]; then export STORAGE_VALIDATION_CONCURRENCY=auto
else unset STORAGE_VALIDATION_CONCURRENCY; fi
backup_job_begin "$MODE" "$@"
# A stopped stable cutover may hand restore validation to the owner machine
# (ADR 0045): the host exports a directory dump, publishes an owner request and
# seals only after a report bound to this capture and candidate arrives.
OWNER=0
if [[ -n "${BACKUP_OWNER_VALIDATION:-}" ]]; then
  [[ "$MODE" == maintenance && "${BACKUP_ENVIRONMENT:-stable}" == stable && "$BACKUP_OWNER_VALIDATION" =~ ^[a-f0-9-]{36}$
    && "${BACKUP_OWNER_REQUEST:-}" == /* && "${BACKUP_OWNER_REPORT:-}" == /* && "${BACKUP_OWNER_WAIT_MS:-900000}" =~ ^[0-9]+$ ]] || { echo 'Invalid owner validation request' >&2; exit 1; }
  OWNER=1
fi
export APP_UID="$(id -u)" APP_GID="$(id -g)"
umask 077
STEM="${1:?Usage: backup-storage.sh <daily-|pre-|manual-name> [--already-stopped]}"
[[ "$STEM" =~ ^(daily|pre|manual)-[a-zA-Z0-9._-]+$ ]] || { echo 'Invalid backup name'; exit 1; }
mkdir -p backups
if [[ "${MAINTENANCE_LOCK_HELD:-0}" != 1 ]]; then
  exec 9>backups/.maintenance.lock
  backup_command flock -w 60 9
fi
COMPOSE=(docker compose -f "${BACKUP_COMPOSE_FILE:-docker-compose.prod.yml}")
[[ -z "${BACKUP_COMPOSE_PROJECT:-}" ]] || COMPOSE+=(-p "$BACKUP_COMPOSE_PROJECT")
SUCCESS=0
cleanup() {
  backup_job_cleanup
  rm -rf -- "$BACKUP_PENDING"
  if [[ "$SUCCESS" != 1 ]]; then rm -f "backups/$STEM.tgz" "backups/$STEM.manifest.json" "backups/env-$STEM"; fi
}
# Never remove a previously committed stem, including on a failed retry.
[[ ! -e "backups/$STEM.tgz" && ! -e "backups/$STEM.manifest.json" && ! -e "backups/env-$STEM" ]] || { echo 'Backup already exists'; exit 1; }
mkdir -m 700 -- "$BACKUP_PENDING" || { echo 'Backup staging must be fresh'; exit 1; }
trap cleanup EXIT
trap 'exit 124' INT TERM HUP
backup_reap_tools
mkdir -p "$BACKUP_PENDING/capture"
if [[ "$MODE" == online ]]; then
  backup_running_image
else
  SOURCE_BUILD_ID="${SOURCE_BUILD_ID:-$(git rev-parse HEAD)}"
  export SOURCE_BUILD_ID
  if [[ -n "${BACKUP_SOURCE_IMAGE:-}" ]]; then
    [[ "$BACKUP_SOURCE_IMAGE" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Invalid source image'; exit 1; }
    printf 'services:\n  app:\n    image: %s\n' "$BACKUP_SOURCE_IMAGE" > "$BACKUP_PENDING/image.compose.yml"
    if [[ "$BACKUP_ENVIRONMENT" != stable ]]; then printf '  capture:\n    image: %s\n' "$BACKUP_SOURCE_IMAGE" >> "$BACKUP_PENDING/image.compose.yml"; fi
    COMPOSE+=(-f "$PWD/$BACKUP_PENDING/image.compose.yml")
  fi
fi
backup_container cleanup-scratch /backup
backup_container ledger-export /backup/replay-removals.latest.json
if [[ "$MODE" == online ]]; then
  backup_container export-online "/backup/.pending-$BACKUP_JOB_ID/capture"
else
  backup_container export "/backup/.pending-$BACKUP_JOB_ID/capture" --applications-stopped $([[ "$OWNER" == 1 ]] && printf -- --directory-database)
fi
ENV_FILES=(.env data/dependencies.compose.env)
[[ ! -f data/local-services.env ]] || ENV_FILES+=(data/local-services.env)
backup_command tar -czf "$BACKUP_PENDING/env" "${ENV_FILES[@]}"
if [[ "$OWNER" == 1 ]]; then
  backup_container ledger-export /backup/replay-removals.latest.json
  owner_deadline="$(( $(date +%s%N) / 1000000 + ${BACKUP_OWNER_WAIT_MS:-900000} ))"
  backup_command node "$POLICY_ROOT/scripts/backup-files.mjs" owner-request "$BACKUP_PENDING" "$PWD/backups/replay-removals.latest.json" "$owner_deadline"
  # The owner pulls the capture while the host packages it; fast compression keeps downtime short.
  backup_command tar -C "$BACKUP_PENDING/capture" -I 'gzip -1' -cf "$PWD/$BACKUP_PENDING/archive.tgz" .
  until [[ -e "$BACKUP_OWNER_REPORT" ]]; do
    (( $(date +%s%N) / 1000000 < owner_deadline )) || { echo 'Owner validation report did not arrive in time' >&2; exit 1; }
    backup_seconds_left >/dev/null || exit 124
    sleep 2
  done
  backup_command node "$POLICY_ROOT/scripts/backup-files.mjs" accept-owner-report "$BACKUP_PENDING"
else
  backup_command tar -C "$BACKUP_PENDING/capture" -czf "$PWD/$BACKUP_PENDING/archive.tgz" .
  backup_container ledger-export /backup/replay-removals.latest.json
  backup_container validate "/backup/.pending-$BACKUP_JOB_ID/capture" \
    | backup_command node "$POLICY_ROOT/scripts/backup-files.mjs" write-report "$BACKUP_PENDING/report.json"
fi
backup_command node "$POLICY_ROOT/scripts/backup-files.mjs" seal "$BACKUP_PENDING" "$STEM"
chmod 600 "$BACKUP_PENDING/archive.tgz" "$BACKUP_PENDING/env" "$BACKUP_PENDING/manifest.json" backups/replay-removals.latest.json
mv "$BACKUP_PENDING/archive.tgz" "backups/$STEM.tgz"
mv "$BACKUP_PENDING/env" "backups/env-$STEM"
mv "$BACKUP_PENDING/manifest.json" "backups/$STEM.manifest.json"
SUCCESS=1
cp "backups/$STEM.manifest.json" "$BACKUP_PENDING/observability.json"
mv "$BACKUP_PENDING/observability.json" backups/observability.latest.json
chmod 600 backups/observability.latest.json
echo "Validated native backup: backups/$STEM.tgz"

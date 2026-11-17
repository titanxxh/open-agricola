#!/usr/bin/env bash
# Host side of the Owner-local Backup. `capture` takes one online,
# snapshot-consistent capture in an rsync-friendly layout for the owner machine
# to pull; `release` removes it after the pull. It never stops applications,
# never validates on the host and never copies configuration or credentials.
# At most one owner capture exists; daily pruning also removes a stale one.
set -euo pipefail
POLICY_ROOT="${BACKUP_POLICY_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "${BACKUP_WORKING_DIRECTORY:-$POLICY_ROOT}"
source "$POLICY_ROOT/scripts/backup-process.sh"
case "${1:-}" in
  capture) ;;
  release)
    [[ "${2:-}" =~ ^\.capture-owner-[A-Za-z0-9-]+$ ]] || { echo 'Invalid owner capture name' >&2; exit 1; }
    rm -rf -- "backups/$2"
    printf 'OWNER_CAPTURE_RELEASED %s\n' "$2"
    exit 0 ;;
  *) echo 'Usage: owner-sync-capture.sh capture | release <.capture-owner-id>' >&2; exit 1 ;;
esac
backup_job_begin online "$@"
export APP_UID="$(id -u)" APP_GID="$(id -g)"
umask 077
mkdir -p backups
chmod 700 backups
exec 9>backups/.maintenance.lock
backup_command flock -w 60 9
COMPOSE=(docker compose -f "${BACKUP_COMPOSE_FILE:-docker-compose.prod.yml}")
NAME=".capture-owner-$BACKUP_JOB_ID"
SUCCESS=0
cleanup() {
  backup_job_cleanup
  rm -rf -- "$BACKUP_PENDING"
  if [[ "$SUCCESS" != 1 ]]; then rm -rf -- "backups/$NAME"; fi
}
trap cleanup EXIT
trap 'exit 124' INT TERM HUP
for previous in backups/.capture-owner-*; do
  [[ -e "$previous" ]] && rm -rf -- "$previous"
done
backup_reap_tools
backup_running_image
mkdir -m 700 -- "backups/$NAME"
backup_container ledger-export "/backup/$NAME/ledger.json"
backup_container export-online "/backup/$NAME/capture" --directory-database
SUCCESS=1
# One machine-readable line; compose may print other output before it.
printf 'OWNER_CAPTURE {"name":"%s","sourceBuildId":"%s","image":"%s"}\n' "$NAME" "$SOURCE_BUILD_ID" "$BACKUP_CAPTURED_IMAGE"

#!/bin/bash
# Maintainer-only daily online backup and independently committed offsite copy.
set -euo pipefail
cd "$(dirname "$0")"
source scripts/backup-process.sh
backup_job_begin online "$@"
export APP_UID="$(id -u)" APP_GID="$(id -g)"
umask 077
env_value() { sed -n "s/^$1=//p" .env 2>/dev/null | tail -n 1 || true; }
OFFSITE_BACKUP_TARGET="${OFFSITE_BACKUP_TARGET:-$(env_value OFFSITE_BACKUP_TARGET)}"
OFFSITE_BACKUP_REMOTE_DIR="${OFFSITE_BACKUP_REMOTE_DIR:-$(env_value OFFSITE_BACKUP_REMOTE_DIR)}"
OFFSITE_BACKUP_REMOTE_DIR="${OFFSITE_BACKUP_REMOTE_DIR:-/root/open-agricola-backups}"
[[ -n "$OFFSITE_BACKUP_TARGET" && "$OFFSITE_BACKUP_TARGET" != -* ]] || { echo 'Missing or invalid OFFSITE_BACKUP_TARGET'; exit 1; }
[[ "$OFFSITE_BACKUP_REMOTE_DIR" =~ ^/[a-zA-Z0-9_./-]+$ ]] || { echo 'Invalid offsite directory'; exit 1; }
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o ServerAliveInterval=5 -o ServerAliveCountMax=2)
COMPOSE=(docker compose -f docker-compose.prod.yml)
LEDGER=backups/replay-removals.latest.json
MODE="${1:-full}"
[[ "$MODE" == full || "$MODE" == ledger-only ]] || { echo 'Unknown backup mode'; exit 1; }
mkdir -p backups
chmod 700 backups
exec 9>backups/.maintenance.lock
if [[ "$MODE" == ledger-only ]]; then
  backup_command flock -w 60 9
else
  flock -n 9 || { echo 'Backup or deployment is already running; skip this schedule'; exit 0; }
fi
INCOMING=''
cleanup() {
  if [[ -n "$INCOMING" ]]; then
    # Best effort within the original budget; autonomous age cleanup handles an unreachable host.
    backup_cleanup_command timeout 2 ssh "${SSH_OPTS[@]}" "$OFFSITE_BACKUP_TARGET" \
      timeout --signal=TERM --kill-after=1s 1 rm -rf -- "$OFFSITE_BACKUP_REMOTE_DIR/$INCOMING" >/dev/null 2>&1 || true
  fi
  backup_job_cleanup
  rm -rf -- "$BACKUP_PENDING"
}
trap cleanup EXIT
trap 'exit 124' INT TERM HUP

remote_budget_command() {
  local command
  printf -v command '%q ' bash -c '
deadline="$1"; shift
remaining=$(( deadline - $(date +%s%N) / 1000000 ))
(( remaining > 0 )) || exit 124
seconds=$(printf "%d.%03d" "$((remaining / 1000))" "$((remaining % 1000))")
exec timeout --signal=TERM --kill-after=3s "$seconds" "$@"
' backup "$BACKUP_DEADLINE_EPOCH_MS" "$@"
  printf '%s' "$command"
}

backup_remote() {
  local command
  backup_seconds_left >/dev/null || return
  command="$(remote_budget_command "$@")"
  backup_command ssh "${SSH_OPTS[@]}" "$OFFSITE_BACKUP_TARGET" "$command"
}

backup_rsync() {
  local command
  backup_seconds_left >/dev/null || return
  command="$(remote_budget_command rsync)"
  backup_command rsync --rsync-path="$command" "$@"
}

ensure_remote_dir() {
  backup_remote bash -s -- "$OFFSITE_BACKUP_REMOTE_DIR" <<'REMOTE'
set -eu
mkdir -p -- "$1"
chmod 700 -- "$1"
REMOTE
}

sync_ledger() {
  mkdir -p "$BACKUP_PENDING"
  backup_remote bash -s -- "$OFFSITE_BACKUP_REMOTE_DIR" > "$BACKUP_PENDING/ledger-incoming.json" <<'REMOTE' || return 1
if test -f "$1/replay-removals.latest.json"; then cat "$1/replay-removals.latest.json"
else printf '%s' '{"version":1,"batches":[]}'; fi
REMOTE
  backup_container ledger-merge "/backup/.pending-$BACKUP_JOB_ID/ledger-incoming.json" || return 1
  backup_container ledger-export /backup/replay-removals.latest.json || return 1
  backup_rsync -a -e "ssh ${SSH_OPTS[*]}" "$LEDGER" \
    "$OFFSITE_BACKUP_TARGET:$OFFSITE_BACKUP_REMOTE_DIR/.ledger-$BACKUP_JOB_ID.json" || return 1
  backup_remote bash -s -- "$OFFSITE_BACKUP_REMOTE_DIR" ".ledger-$BACKUP_JOB_ID.json" "$BACKUP_DEADLINE_EPOCH_MS" <<'REMOTE' || return 1
set -eu
trap 'rm -f -- "$1/$2"' EXIT
(( $(date +%s%N) / 1000000 < $3 )) || exit 124
mv -- "$1/$2" "$1/replay-removals.latest.json"
REMOTE
  echo 'Independent erasure ledger union synchronized'
}

if [[ "$MODE" == ledger-only ]]; then
  ensure_remote_dir
  sync_ledger
  exit 0
fi

BACKUP_STEM="daily-$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_OK=1
if ! MAINTENANCE_LOCK_HELD=1 bash scripts/backup-storage.sh "$BACKUP_STEM"; then
  BACKUP_OK=0
  echo 'Backup failed; retention and offsite synchronization still run within the original deadline'
fi
# Counts include only complete validated sets. The age cap also removes abandoned work.
if ! backup_command node scripts/backup-files.mjs prune backups 7 5; then BACKUP_OK=0; fi
mkdir -p "$BACKUP_PENDING"
SYNC_OK=1
LEDGER_OK=1
INCOMING=".incoming-$BACKUP_JOB_ID"
if ensure_remote_dir; then
  if backup_command node scripts/backup-files.mjs list backups "$BACKUP_PENDING/files.nul" "$BACKUP_PENDING/checksums.tsv"; then
    if ! backup_remote bash -s -- "$OFFSITE_BACKUP_REMOTE_DIR/$INCOMING" <<'REMOTE'
set -eu
mkdir -p -- "$1"
chmod 700 -- "$1"
REMOTE
    then
      SYNC_OK=0
      echo 'Offsite staging failed; erasure synchronization and retention still run'
    # Immutable existing destination files can be hard-linked into this private transfer.
    # No --delete: local removal does not erase offsite history.
    elif backup_rsync -az --from0 --files-from="$BACKUP_PENDING/files.nul" \
      --link-dest="$OFFSITE_BACKUP_REMOTE_DIR" -e "ssh ${SSH_OPTS[*]}" \
      backups/ "$OFFSITE_BACKUP_TARGET:$OFFSITE_BACKUP_REMOTE_DIR/$INCOMING/" \
      && backup_rsync -a -e "ssh ${SSH_OPTS[*]}" "$BACKUP_PENDING/checksums.tsv" \
        "$OFFSITE_BACKUP_TARGET:$OFFSITE_BACKUP_REMOTE_DIR/$INCOMING/checksums.tsv" \
      && backup_remote bash -s -- "$OFFSITE_BACKUP_REMOTE_DIR" "$INCOMING" \
        "$BACKUP_DEADLINE_EPOCH_MS" < deploy/commit-backup-set.sh; then
      echo 'Validated backup sets synchronized'
      INCOMING=''
    else
      SYNC_OK=0
      echo 'Offsite transfer failed; no incomplete set is committed'
    fi
  else SYNC_OK=0; fi
  sync_ledger || LEDGER_OK=0
  # Independently enforce age/count limits even if capture or synchronization failed.
  backup_remote bash -s -- \
    "$OFFSITE_BACKUP_REMOTE_DIR" < deploy/offsite-retention.sh || SYNC_OK=0
else
  SYNC_OK=0
  LEDGER_OK=0
fi
if [[ "$BACKUP_OK" != 1 || "$SYNC_OK" != 1 || "$LEDGER_OK" != 1 ]]; then
  echo "Backup job failed (backup=$BACKUP_OK sync=$SYNC_OK ledger=$LEDGER_OK)"
  exit 1
fi
echo ">>> [$(date -u +%Y-%m-%dT%H:%M:%SZ)] ✓ 定时备份 + 异机同步完成"

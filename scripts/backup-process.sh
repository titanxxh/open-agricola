#!/usr/bin/env bash
# Shared lifecycle for online backup tools; never controls the live app service.

backup_job_begin() {
  local mode="$1"; shift
  export BACKUP_ENVIRONMENT="${BACKUP_ENVIRONMENT:-stable}"
  [[ "$BACKUP_ENVIRONMENT" == stable || "$BACKUP_ENVIRONMENT" =~ ^prerelease-[a-z0-9-]+$ ]] || { echo 'Invalid backup environment' >&2; return 1; }
  # Both scheduled and drained maintenance captures share one finite work budget.
  local backup_limit="$(( $(date +%s%N) / 1000000 + 1790000 ))"
  if [[ -z "${BACKUP_DEADLINE_EPOCH_MS:-}" ]]; then export BACKUP_DEADLINE_EPOCH_MS="$backup_limit"; fi
  backup_seconds_left >/dev/null || return
  # Preserve an earlier caller deadline and reserve ten seconds for cleanup.
  if (( BACKUP_DEADLINE_EPOCH_MS > backup_limit )); then export BACKUP_DEADLINE_EPOCH_MS="$backup_limit"; fi
  if [[ -z "${BACKUP_JOB_ID:-}" ]]; then
    export BACKUP_JOB_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
    if [[ "$mode" != maintenance ]]; then
      exec timeout --signal=TERM --kill-after=10s "$(backup_seconds_left)" bash "$0" "$@"
    fi
  fi
  [[ "$BACKUP_JOB_ID" =~ ^[a-zA-Z0-9-]+$ ]] || { echo 'Invalid backup run identity' >&2; return 1; }
  BACKUP_PENDING="backups/.pending-$BACKUP_JOB_ID"
  BACKUP_SEQUENCE=0
  if [[ -n "${BACKUP_DEADLINE_EPOCH_MS:-}" ]]; then backup_seconds_left >/dev/null; fi
}

backup_seconds_left() {
  if [[ -z "${BACKUP_DEADLINE_EPOCH_MS:-}" ]]; then printf '0\n'; return; fi
  [[ "$BACKUP_DEADLINE_EPOCH_MS" =~ ^[0-9]+$ ]] || { echo 'Invalid backup deadline' >&2; return 1; }
  local remaining="$(( BACKUP_DEADLINE_EPOCH_MS - $(date +%s%N) / 1000000 ))"
  (( remaining > 0 && remaining <= 1800000 )) || { echo 'Backup deadline exceeded' >&2; return 124; }
  printf '%s\n' "$(( (remaining + 999) / 1000 ))"
}

backup_command() {
  local seconds
  seconds="$(backup_seconds_left)" || return
  timeout --signal=TERM --kill-after=3s "$seconds" "$@"
}

backup_cleanup_command() {
  if [[ -n "${BACKUP_DEADLINE_EPOCH_MS:-}" ]]; then
    BACKUP_DEADLINE_EPOCH_MS="$(( BACKUP_DEADLINE_EPOCH_MS + 10000 ))" backup_command "$@"
  else
    backup_command "$@"
  fi
}

backup_job_cleanup() {
  local containers
  containers="$(backup_cleanup_command timeout 5 docker ps -aq --filter "label=org.open-agricola.backup.run=$BACKUP_JOB_ID" --filter "label=org.open-agricola.backup.environment=$BACKUP_ENVIRONMENT" 2>/dev/null)" || containers=''
  if [[ -n "$containers" ]]; then
    # IDs come exclusively from Docker's run-owned label filter.
    backup_cleanup_command timeout 5 docker rm -f $containers >/dev/null 2>&1 || true
  fi
}

backup_reap_tools() {
  local container deadline
  local containers
  containers="$(backup_command docker ps -aq --filter label=org.open-agricola.backup.run --filter "label=org.open-agricola.backup.environment=$BACKUP_ENVIRONMENT")"
  for container in $containers; do
    deadline="$(backup_command docker inspect --format '{{index .Config.Labels "org.open-agricola.backup.deadline"}}' "$container")"
    # The caller holds the host lock. A zero-deadline maintenance tool cannot
    # belong to another supported deployment still in progress.
    if [[ "$deadline" =~ ^[0-9]+$ ]] && (( deadline == 0 || deadline <= $(date +%s%N) / 1000000 )); then
      backup_command docker rm -f "$container" >/dev/null
    fi
  done
}

backup_running_image() {
  local container image protocol project managed
  container="$(backup_command "${COMPOSE[@]}" ps -q app)"
  [[ "$container" =~ ^[0-9a-f]+$ ]] || { echo 'Online backup requires exactly one running app container' >&2; return 1; }
  [[ "$(backup_command docker inspect --format '{{.State.Running}}' "$container")" == true ]] || return 1
  image="$(backup_command docker inspect --format '{{.Image}}' "$container")"
  [[ "$image" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo 'Invalid running application image' >&2; return 1; }
  project="$(backup_command docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$container")"
  [[ -n "$project" && "$project" != '<no value>' ]] || { echo 'Application container has no deployment inventory' >&2; return 1; }
  if [[ "$BACKUP_ENVIRONMENT" != stable ]]; then
    [[ "$project" == "open-agricola-$BACKUP_ENVIRONMENT" ]] || { echo 'Backup application project does not match its environment' >&2; return 1; }
    [[ "$(backup_command docker inspect --format '{{index .Config.Labels "io.open-agricola.release-channel"}}' "$container")" == prerelease ]] || { echo 'Backup requires a prerelease application' >&2; return 1; }
  fi
  managed="$(backup_command docker ps -q --no-trunc --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=app --filter label=com.docker.compose.oneoff=False)"
  [[ "$managed" == "$container" ]] || { echo 'Online backup requires one complete managed application generation' >&2; return 1; }
  protocol="$(backup_command docker exec "$container" node --import tsx --input-type=module -e 'import { RESOURCE_DELETION_PROTOCOL } from "./server/storage/backup-coordination.ts"; console.log(RESOURCE_DELETION_PROTOCOL)')"
  [[ "$protocol" == 1 ]] || { echo 'The running application does not support online resource capture' >&2; return 1; }
  SOURCE_BUILD_ID="$(backup_command docker exec "$container" node -p 'process.env.GAME_BUILD_ID')"
  [[ "$SOURCE_BUILD_ID" =~ ^[0-9a-f]{40}$ ]] || { echo 'Online backup requires a deployed application build' >&2; return 1; }
  export SOURCE_BUILD_ID
  export BACKUP_CAPTURED_IMAGE="$image"
  mkdir -p "$BACKUP_PENDING"
  printf 'services:\n  app:\n    image: %s\n' "$image" > "$BACKUP_PENDING/image.compose.yml"
  if [[ "$BACKUP_ENVIRONMENT" != stable ]]; then printf '  capture:\n    image: %s\n' "$image" >> "$BACKUP_PENDING/image.compose.yml"; fi
  COMPOSE+=(-f "$PWD/$BACKUP_PENDING/image.compose.yml")
}

backup_container() {
  local seconds name service
  local environment=(-e "SOURCE_BUILD_ID=${SOURCE_BUILD_ID:-}")
  seconds="$(backup_seconds_left)" || return
  if [[ -n "${BACKUP_DEADLINE_EPOCH_MS:-}" ]]; then environment+=(-e "BACKUP_DEADLINE_EPOCH_MS=$BACKUP_DEADLINE_EPOCH_MS"); fi
  BACKUP_SEQUENCE=$((BACKUP_SEQUENCE + 1))
  name="agricola-backup-$BACKUP_ENVIRONMENT-$BACKUP_JOB_ID-$$-$BACKUP_SEQUENCE"
  service="${BACKUP_TOOL_SERVICE:-app}"
  case "$1" in export|export-online|ledger-export|ledger-merge) service="${BACKUP_CAPTURE_SERVICE:-app}";; esac
  [[ "$service" == app || "$service" == tools || "$service" == capture ]] || { echo 'Invalid backup tool service'; return 1; }
  if [[ "$BACKUP_ENVIRONMENT" != stable ]]; then
    [[ "${BACKUP_TOOL_MEMORY_MIB:-}" =~ ^[0-9]+$ && "${BACKUP_TOOL_PIDS:-}" =~ ^[0-9]+$ && "${BACKUP_TOOL_CPUS:-}" =~ ^[0-9]+([.][0-9]+)?$ ]] || { echo 'Missing prerelease backup limits'; return 1; }
    [[ "$BACKUP_TOOL_SERVICE" == tools && "$BACKUP_CAPTURE_SERVICE" == capture ]] || { echo 'Prerelease backups require isolated bounded tool services'; return 1; }
    backup_command "$POLICY_ROOT/node_modules/.bin/tsx" "$POLICY_ROOT/scripts/prerelease/archive-policy.ts" "$@"
    return
  fi
  backup_command "${COMPOSE[@]}" run --rm --no-deps -T --name "$name" \
    --label "org.open-agricola.backup.run=$BACKUP_JOB_ID" \
    --label "org.open-agricola.backup.environment=$BACKUP_ENVIRONMENT" \
    --label "org.open-agricola.backup.deadline=${BACKUP_DEADLINE_EPOCH_MS:-0}" \
    --user "$(node "$POLICY_ROOT/scripts/ci/docker-bind-user.ts")" "${environment[@]}" -e "BACKUP_JOB_ID=$BACKUP_JOB_ID" -e BACKUP_SCRATCH_DIRECTORY=/backup \
    -v "$PWD/backups:/backup" "$service" timeout --signal=TERM --kill-after=3s "$seconds" \
    node --import tsx scripts/storage-archive-cli.ts "$@"
}

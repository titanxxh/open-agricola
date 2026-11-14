#!/usr/bin/env bash
set -euo pipefail
HOST="${1:-ubuntu@ten-kr}"
[[ "$HOST" == *@* ]] || HOST="ubuntu@$HOST"
DIRECTORY="${2:-/home/ubuntu/open-agricola}"
[[ $# -eq 0 ]] || shift
[[ $# -eq 0 ]] || shift
[[ "$HOST" =~ ^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+$ ]] || { echo 'Invalid SSH host' >&2; exit 1; }
[[ "$DIRECTORY" =~ ^/[A-Za-z0-9_./-]+$ && "$DIRECTORY" != / ]] || { echo 'Invalid deployment directory' >&2; exit 1; }
printf -v COMMAND '%q ' bash -c 'set -euo pipefail; cd "$1"; [[ "$(pwd -P)" == "$1" && -f backups/.maintenance.lock && ! -L backups/.maintenance.lock ]]; exec flock -w 60 backups/.maintenance.lock env BACKEND_IMAGE_GC_LOCKED=1 node --input-type=module-typescript - "$@"' bash "$DIRECTORY" "$@"
exec ssh "$HOST" "$COMMAND" < "$(dirname "$0")/scripts/release/backend-image-cleanup.ts"

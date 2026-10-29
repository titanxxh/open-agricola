#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == '--wechat-qr' || "${1:-}" == '--feishu-qr' ]]; then
  QR_PLATFORM="${1#--}"
  QR_PLATFORM="${QR_PLATFORM%-qr}"
  shift
  exec node "$(dirname "$0")/operations/update-community-qr.mjs" "$QR_PLATFORM" "$@"
fi
HOST="${1:-ubuntu@ten-kr}"
[[ "$HOST" == *@* ]] || HOST="ubuntu@$HOST"
REF="${2:-main}"
OPERATIONS_DIR="${3:-/home/ubuntu/open-agricola-operations}"
GAME_DIR="${4:-/home/ubuntu/open-agricola}"
BUILD_ID="$(git rev-parse "$REF^{commit}")"
ARCHIVE="$(mktemp)"
trap 'rm -f "$ARCHIVE"' EXIT
# Only versioned operations source leaves the owner machine. No game checkout,
# game build, database migration, Release or maintenance stop is involved.
git -c tar.umask=0022 archive --format=tar "$BUILD_ID" operations > "$ARCHIVE"
ARCHIVE_NAME="incoming-${BUILD_ID}-$(basename "$ARCHIVE").tar"
printf -v REMOTE_ROOT '%q' "$OPERATIONS_DIR"
printf -v REMOTE_ARCHIVE '%q' "$OPERATIONS_DIR/$ARCHIVE_NAME"
ssh "$HOST" "umask 077; mkdir -p $REMOTE_ROOT; cat > $REMOTE_ARCHIVE" < "$ARCHIVE"
printf -v REMOTE_COMMAND '%q ' bash -s -- "$OPERATIONS_DIR" "$GAME_DIR" "$BUILD_ID" "$ARCHIVE_NAME"
ssh "$HOST" "$REMOTE_COMMAND" <<'REMOTE'
set -euo pipefail
OPERATIONS_DIR="$1"
GAME_DIR="$2"
BUILD_ID="$3"
ARCHIVE_NAME="$4"
umask 077
exec 9>"$OPERATIONS_DIR/deployment.lock"
flock -w 300 9
RELEASE_DIR="$OPERATIONS_DIR/releases/$BUILD_ID"
mkdir -p "$RELEASE_DIR"
tar -xpf "$OPERATIONS_DIR/$ARCHIVE_NAME" -C "$RELEASE_DIR"
rm -f "$OPERATIONS_DIR/$ARCHIVE_NAME"
node "$RELEASE_DIR/operations/deploy.mjs" "$OPERATIONS_DIR" "$GAME_DIR" "$BUILD_ID"
REMOTE

#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PNPM_BIN="${PNPM_BIN:-pnpm}"
BACKEND_PORT="${BACKEND_PORT:-5175}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
BACKEND_LOG="${BACKEND_LOG:-$SCRIPT_DIR/backend.log}"
FRONTEND_LOG="${FRONTEND_LOG:-$SCRIPT_DIR/frontend.log}"

# The main repo backing this checkout: the same directory when run normally,
# and the original clone when run from a worktree.
MAIN_REPO_DIR="$(cd "$(dirname "$(git -C "$SCRIPT_DIR" rev-parse --path-format=absolute --git-common-dir)")" && pwd -P)"

# Local platform features (GitHub OAuth, community deck toggle, API bases, etc.)
# live in .env during development. Export them so both tsx and Vite see the
# same config when this script is used as the one-stop local launcher.
#
# .env is untracked, so a worktree is created without one. Fall back to the main
# repo's, the same way persistent dev state is anchored there — otherwise every
# new worktree silently starts with no GH_TOKEN, no OAuth config and no API
# bases, and the first symptom is an opaque 403 while fetching the public asset
# inventory.
ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  ENV_FILE="$MAIN_REPO_DIR/.env"
fi
if [ -f "$ENV_FILE" ]; then
  echo "Using env file: $ENV_FILE"
  set -a
  # shellcheck disable=SC1091
  . "$ENV_FILE"
  set +a
fi

# Anchor persistent dev state (sqlite DB, JSON room snapshots, custom cards,
# card art) to the MAIN repo even when we're running from
# a worktree. Without this, each worktree gets its own ./data and ./output,
# so fixed dev room game state diverges across worktrees.
#
# Override: pass the env var explicitly to escape this anchor (e.g.
#   DB_DIR=/tmp/foo PERSISTED_ROOMS_DIR=/tmp/bar ./restart-local.sh
# ).
SHARED_DATA_DIR="${SHARED_DATA_DIR:-$MAIN_REPO_DIR/data}"
SHARED_OUTPUT_DIR="${SHARED_OUTPUT_DIR:-$MAIN_REPO_DIR/output}"

DB_DIR="${DB_DIR:-$SHARED_DATA_DIR}"
DB_PATH="${DB_PATH:-$DB_DIR/open-agricola.db}"
PERSISTED_ROOMS_DIR="${PERSISTED_ROOMS_DIR:-$SHARED_OUTPUT_DIR}"
CUSTOM_CARD_DIR="${CUSTOM_CARD_DIR:-$SHARED_DATA_DIR/custom-cards}"
CARD_ART_DIR="${CARD_ART_DIR:-$SHARED_DATA_DIR/card-art}"
REPLAY_VIEWER_ROOT="${REPLAY_VIEWER_ROOT:-$SHARED_DATA_DIR/replay-viewers}"
REPLAY_ASSET_ROOT="${REPLAY_ASSET_ROOT:-$SHARED_DATA_DIR/replay-assets}"
REPLAY_REMOVAL_LEDGER_PATH="${REPLAY_REMOVAL_LEDGER_PATH:-$SHARED_DATA_DIR/replay-removals.jsonl}"

# Linked worktrees may share the main checkout's installed dependencies.
# Materialize missing top-level entries as symlinks so Node/Vite can resolve
# bare imports relative to source files even when the worktree lives outside
# the main checkout's parent directory. Existing local entries always win.
LOCAL_NODE_BIN="$SCRIPT_DIR/node_modules/.bin"
MAIN_NODE_BIN="$MAIN_REPO_DIR/node_modules/.bin"
if [ -x "$LOCAL_NODE_BIN/tsx" ] && [ -x "$LOCAL_NODE_BIN/vite" ]; then
  NODE_BIN_DIR="$LOCAL_NODE_BIN"
elif [ -x "$MAIN_NODE_BIN/tsx" ] && [ -x "$MAIN_NODE_BIN/vite" ]; then
  mkdir -p "$SCRIPT_DIR/node_modules"
  while IFS= read -r -d '' dependency; do
    dependency_name="$(basename "$dependency")"
    case "$dependency_name" in
      .vite|.vite-temp|.tmp) continue ;;
    esac
    local_dependency="$SCRIPT_DIR/node_modules/$dependency_name"
    if [ ! -e "$local_dependency" ] && [ ! -L "$local_dependency" ]; then
      ln -s "$dependency" "$local_dependency"
    fi
  done < <(find "$MAIN_REPO_DIR/node_modules" -mindepth 1 -maxdepth 1 -print0)
  NODE_BIN_DIR="$MAIN_NODE_BIN"
else
  echo "Error: dependencies are missing. Run: pnpm install"
  exit 1
fi
BACKEND_BIN="$NODE_BIN_DIR/tsx"
FRONTEND_BIN="$NODE_BIN_DIR/vite"
export PATH="$NODE_BIN_DIR:$PATH"

if ! command -v lsof >/dev/null 2>&1; then
  echo "Error: lsof is required but not installed."
  exit 1
fi

usage() {
  cat <<'EOF'
Usage: ./restart-local.sh [--kill-only|--kill_only|-k]
                          [--players N | -p N | --players=N | -p=N]
                          [--parents] [--seasons] [--moor] [--draft] [--preview]
                          [--intranet] [-h|--help]

Without flags: stop any process on the frontend/backend ports, then start
fresh backend (tsx) and frontend (vite) bound to 127.0.0.1, reachable only
from this machine. Five persistent dev rooms (dev2 / dev3 / dev4 / dev5 / dev6)
are created automatically; each survives backend restarts independently.

  --kill-only, --kill_only, -k   Only stop existing listeners; do not start
                                 backend or frontend.
  --players N, -p N              Pick the dev room for N players (2/3/4/5/6).
                                 Defaults to 4. Links for all fixed rooms are
                                 always printed; the selected one is marked.
  --parents                      Enable Parent Cards for fixed dev rooms.
  --seasons                      Enable Through the Seasons for fixed dev rooms.
  --moor                         Enable Farmers of the Moor for fixed dev
                                 rooms, allowing the incomplete FoM minor pool.
  --draft                        Start fixed dev rooms in simultaneous draft
                                 mode with draft pool size 7. Requires a reset.
  --preview                      Build the frontend and serve dist with
                                 vite preview for production-like loading.
  --intranet                     Bind to this host's LAN IPv4 (macOS en0 /
                                 Linux eth0) so other machines on the network
                                 can reach the dev server. Fails if that
                                 address cannot be determined.
  -h, --help                     Show this help.
EOF
}

KILL_ONLY=0
PLAYERS="4"
PARENTS_ENABLED=0
SEASONS_ENABLED=0
MOOR_ENABLED=0
DRAFT_ENABLED=0
PREVIEW_ENABLED=0
INTRANET_ENABLED=0
while [ $# -gt 0 ]; do
  case "$1" in
    --kill-only|--kill_only|-k)
      KILL_ONLY=1
      shift
      ;;
    --players|-p)
      if [ $# -lt 2 ]; then
        echo "Error: $1 requires a value (2, 3, 4, 5 or 6)."
        exit 1
      fi
      PLAYERS="$2"
      shift 2
      ;;
    --players=*|-p=*)
      PLAYERS="${1#*=}"
      shift
      ;;
    --parents)
      PARENTS_ENABLED=1
      shift
      ;;
    --seasons)
      SEASONS_ENABLED=1
      shift
      ;;
    --moor)
      MOOR_ENABLED=1
      shift
      ;;
    --draft)
      DRAFT_ENABLED=1
      shift
      ;;
    --preview)
      PREVIEW_ENABLED=1
      shift
      ;;
    --intranet)
      INTRANET_ENABLED=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

case "$PLAYERS" in
  2|3|4|5|6) ;;
  *)
    echo "Error: --players must be 2, 3, 4, 5, or 6 (got: $PLAYERS)"
    exit 1
    ;;
esac

cd "$SCRIPT_DIR"

# Bind address for Vite / backend. Loopback by default; --intranet asks for
# this host's LAN IPv4 (macOS: en0; Linux: eth0) so other machines can connect.
get_lan_ip() {
  case "$(uname -s)" in
    Darwin)
      ipconfig getifaddr en0 2>/dev/null
      ;;
    Linux)
      ip -4 addr show eth0 2>/dev/null | grep -E '^\s+inet ' | awk '{print $2}' | cut -d/ -f1
      ;;
    *)
      echo ""
      ;;
  esac
}

list_listening_pids() {
  # NOTE: lsof exits non-zero when no match is found. Combined with
  # `set -o pipefail` at the top of the script, an empty result would
  # otherwise abort the whole script via `set -e` the first time we
  # check an idle port. Swallow that with `|| true` and rely on the
  # caller's empty-string check.
  local port="$1"
  { lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true; } | sort -u
}

wait_for_port_state() {
  local port="$1"
  local want_listening="$2"
  local attempts="${3:-30}"
  local delay="${4:-0.5}"
  local current=""

  for ((i = 0; i < attempts; i += 1)); do
    current="$(list_listening_pids "$port")"
    if [ "$want_listening" = "yes" ] && [ -n "$current" ]; then
      return 0
    fi
    if [ "$want_listening" = "no" ] && [ -z "$current" ]; then
      return 0
    fi
    sleep "$delay"
  done

  return 1
}

process_target_for_pid() {
  local pid="$1"
  local pgid=""
  local sid=""
  local script_pgid=""

  read -r pgid sid < <(ps -o pgid=,sid= -p "$pid" 2>/dev/null || true) || true
  read -r script_pgid < <(ps -o pgid= -p "$$" 2>/dev/null || true) || true
  if [ -n "$pgid" ] && [ "$pgid" = "$sid" ] && [ "$pgid" != "$script_pgid" ]; then
    echo "-$pgid"
  else
    echo "$pid"
  fi
}

terminate_process_targets() {
  local signal=""
  local target=""
  local alive=0
  local attempt=0

  if [ "$#" -eq 0 ]; then
    return 0
  fi
  for signal in TERM KILL; do
    if [ "$signal" = "KILL" ]; then
      echo "  Escalating to SIGKILL..."
    fi
    for target in "$@"; do
      kill "-$signal" -- "$target" 2>/dev/null || true
    done
    for ((attempt = 0; attempt < 20; attempt += 1)); do
      alive=0
      for target in "$@"; do
        if kill -0 -- "$target" 2>/dev/null; then
          alive=1
          break
        fi
      done
      if [ "$alive" -eq 0 ]; then
        return 0
      fi
      sleep 0.25
    done
  done
  return 1
}

show_log_tail() {
  local label="$1"
  local log_file="$2"
  if [ -f "$log_file" ]; then
    echo "--- ${label} log (tail) ---"
    tail -n 40 "$log_file"
    echo "---------------------------"
  fi
}

stop_port_listeners() {
  local port="$1"
  local label="$2"
  local pids=""
  local pid=""
  local targets=()

  pids="$(list_listening_pids "$port")"
  if [ -z "$pids" ]; then
    echo "  No listeners on $label port $port"
    return 0
  fi

  echo "  Stopping $label listener(s) on port $port..."
  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    ps -p "$pid" -o pid=,command= || true
    targets+=("$(process_target_for_pid "$pid")")
  done <<EOF
$pids
EOF

  if ! terminate_process_targets "${targets[@]}"; then
    echo "Error: failed to stop $label process group(s) on port $port"
    return 1
  fi
  if ! wait_for_port_state "$port" "no" 10 0.2; then
    echo "Error: failed to free $label port $port"
    return 1
  fi
}

dev_rooms_without_variant() {
  local variant="$1"
  DB_PATH="$DB_PATH" VARIANT="$variant" node <<'EOF'
const fs = require('node:fs')
const Database = require('better-sqlite3')

const dbPath = process.env.DB_PATH
if (!dbPath || !fs.existsSync(dbPath)) process.exit(0)
const variant = process.env.VARIANT

const db = new Database(dbPath, { readonly: true, fileMustExist: true })
try {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rooms'").get()
  if (!table) process.exit(0)
  const rows = db.prepare("SELECT id, state_json FROM rooms WHERE id IN ('dev2', 'dev3', 'dev4', 'dev5', 'dev6')").all()
  const missing = rows.filter((row) => {
    if (!row.state_json) return true
    try {
      const state = JSON.parse(row.state_json).state
      switch (variant) {
        case 'parents':
          return state.enableParentCards !== true
        case 'direct-parents':
          return state.enableParentCards !== true || !Array.isArray(state.players) || !state.players.every((player) =>
            player.parentCards && player.parentCards.mother && player.parentCards.father
          )
        case 'seasons':
          return state.enableThroughTheSeasons !== true
        case 'moor':
          return state.enableFarmersOfTheMoor !== true
        default:
          return true
      }
    } catch {
      return true
    }
  })
  if (missing.length > 0) console.log(missing.map((row) => row.id).join(', '))
} finally {
  db.close()
}
EOF
}

confirm_dev_room_reset() {
  local reason="$1"
  local answer=""

  echo ""
  echo "Reset required: $reason"
  echo "This will delete persisted fixed dev rooms: dev2, dev3, dev4, dev5, dev6."
  printf "Type yes to reset and continue: "
  if ! read -r answer; then
    echo "Aborted."
    exit 1
  fi
  if [ "$answer" != "yes" ]; then
    echo "Aborted."
    exit 1
  fi
}

reset_persisted_dev_rooms() {
  DB_PATH="$DB_PATH" node <<'EOF'
const fs = require('node:fs')
const Database = require('better-sqlite3')

const dbPath = process.env.DB_PATH
if (!dbPath || !fs.existsSync(dbPath)) {
  console.log('  No SQLite room DB found.')
  process.exit(0)
}

const db = new Database(dbPath)
try {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rooms'").get()
  if (!table) {
    console.log('  No rooms table found.')
    process.exit(0)
  }
  const result = db.prepare("DELETE FROM rooms WHERE id IN ('dev2', 'dev3', 'dev4', 'dev5', 'dev6')").run()
  console.log(`  Removed ${result.changes} SQLite dev room row(s).`)
} finally {
  db.close()
}
EOF

  for room_id in dev2 dev3 dev4 dev5 dev6; do
    rm -f "$PERSISTED_ROOMS_DIR/${room_id}.json"
  done
}

STARTED_PROCESS_TARGETS=()

cleanup_failed_start() {
  local status=$?
  trap - EXIT
  if [ "$status" -ne 0 ] && [ "${#STARTED_PROCESS_TARGETS[@]}" -gt 0 ]; then
    set +e
    echo "Cleaning up processes from failed startup..."
    terminate_process_targets "${STARTED_PROCESS_TARGETS[@]}"
  fi
  exit "$status"
}

start_and_wait() {
  local label="$1"
  local port="$2"
  local log_file="$3"
  local detached=0
  shift 3

  : > "$log_file"
  if command -v setsid >/dev/null 2>&1; then
    setsid "$@" > "$log_file" 2>&1 &
    detached=1
  else
    nohup "$@" > "$log_file" 2>&1 &
  fi
  local pid=$!
  if [ "$detached" -eq 1 ]; then
    STARTED_PROCESS_TARGETS+=("-$pid")
  else
    STARTED_PROCESS_TARGETS+=("$pid")
  fi
  echo "  PID: $pid"

  for ((i = 0; i < 30; i += 1)); do
    if wait_for_port_state "$port" "yes" 1 0; then
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "Error: $label exited before binding port $port."
      show_log_tail "$label" "$log_file"
      return 1
    fi
    sleep 0.5
  done

  echo "Error: $label did not bind port $port in time."
  show_log_tail "$label" "$log_file"
  return 1
}

trap cleanup_failed_start EXIT

if [ "$KILL_ONLY" -eq 1 ]; then
  echo "Stopping existing processes (kill-only)..."
  stop_port_listeners "$FRONTEND_PORT" "frontend"
  stop_port_listeners "$BACKEND_PORT" "backend"
  echo "Done. Ports $FRONTEND_PORT / $BACKEND_PORT cleared."
  exit 0
fi

echo "Ensuring immutable replay viewer..."
"$PNPM_BIN" run build:cards-manifest
REPLAY_VIEWER_BUILD_ID="${REPLAY_VIEWER_BUILD_ID:-$(
  env \
    REPLAY_VIEWER_ROOT="$REPLAY_VIEWER_ROOT" \
    "$PNPM_BIN" run build:replay-viewer | tail -n 1
)}"
GAME_BUILD_ID="${GAME_BUILD_ID:-$(git -C "$SCRIPT_DIR" rev-parse HEAD)}"

if [ "$INTRANET_ENABLED" -eq 1 ]; then
  BIND_IP=$(get_lan_ip)
  if [ -z "$BIND_IP" ]; then
    echo "Error: --intranet could not determine the LAN IP. On macOS use en0 (ipconfig getifaddr en0); on Linux ensure eth0 exists."
    exit 1
  fi
else
  BIND_IP="127.0.0.1"
fi

RESET_CONFIRMED=0
RESET_REASON=""
if [ "$DRAFT_ENABLED" -eq 1 ]; then
  RESET_REASON="--draft starts fixed dev rooms from the draft phase."
else
  RESET_REASONS=()
  if [ "$PARENTS_ENABLED" -eq 1 ]; then
    if [ "$DRAFT_ENABLED" -eq 1 ]; then
      MISSING_PARENT_ROOMS="$(dev_rooms_without_variant parents)"
    else
      MISSING_PARENT_ROOMS="$(dev_rooms_without_variant direct-parents)"
    fi
    if [ -n "$MISSING_PARENT_ROOMS" ]; then
      RESET_REASONS+=("existing fixed dev room(s) are not Parent Cards games: $MISSING_PARENT_ROOMS.")
    fi
  fi
  if [ "$SEASONS_ENABLED" -eq 1 ]; then
    MISSING_SEASONS_ROOMS="$(dev_rooms_without_variant seasons)"
    if [ -n "$MISSING_SEASONS_ROOMS" ]; then
      RESET_REASONS+=("existing fixed dev room(s) are not Through the Seasons games: $MISSING_SEASONS_ROOMS.")
    fi
  fi
  if [ "$MOOR_ENABLED" -eq 1 ]; then
    MISSING_MOOR_ROOMS="$(dev_rooms_without_variant moor)"
    if [ -n "$MISSING_MOOR_ROOMS" ]; then
      RESET_REASONS+=("existing fixed dev room(s) are not Farmers of the Moor games: $MISSING_MOOR_ROOMS.")
    fi
  fi
  if [ "${#RESET_REASONS[@]}" -gt 0 ]; then
    RESET_REASON="${RESET_REASONS[*]}"
  fi
fi

if [ -n "$RESET_REASON" ]; then
  confirm_dev_room_reset "$RESET_REASON"
  RESET_CONFIRMED=1
fi

echo "Binding to: $BIND_IP$([ "$INTRANET_ENABLED" -eq 1 ] && echo " (intranet)" || echo " (local only; pass --intranet for LAN access)")"
PUBLIC_API_BASE="${PUBLIC_API_BASE:-http://$BIND_IP:$BACKEND_PORT}"
echo "Stopping existing processes..."
stop_port_listeners "$FRONTEND_PORT" "frontend"
stop_port_listeners "$BACKEND_PORT" "backend"

if [ "$RESET_CONFIRMED" -eq 1 ]; then
  echo "Resetting fixed dev rooms..."
  reset_persisted_dev_rooms
fi

if [ "$PREVIEW_ENABLED" -eq 1 ]; then
  echo "Building frontend preview bundle..."
  env \
    VITE_API_BASE="http://$BIND_IP:$BACKEND_PORT" \
    VITE_WS_BASE="ws://$BIND_IP:$BACKEND_PORT/ws" \
    VITE_ENABLE_DEV_AUTH_SHORTCUTS=1 \
    "$PNPM_BIN" run build
fi

echo "Starting backend (port $BACKEND_PORT on $BIND_IP, dev2/dev3/dev4/dev5/dev6 persisted via SQLite)..."
start_and_wait "backend" "$BACKEND_PORT" "$BACKEND_LOG" env \
  NODE_ENV=development \
  PERSIST_ROOMS=sqlite \
  ALLOW_ANONYMOUS_WS=true \
  ENABLE_AUTH_TEST_HELPERS=1 \
  BACKEND_HOST="$BIND_IP" \
  CORS_ORIGIN="http://$BIND_IP:$FRONTEND_PORT" \
  PUBLIC_API_BASE="$PUBLIC_API_BASE" \
  PUBLIC_APP_ORIGIN="http://$BIND_IP:$FRONTEND_PORT" \
  DEV_ENABLE_PARENT_CARDS="$([ "$PARENTS_ENABLED" -eq 1 ] && echo true || echo false)" \
  DEV_DRAFT_PARENTS="$([ "$PARENTS_ENABLED" -eq 1 ] && [ "$DRAFT_ENABLED" -eq 0 ] && echo false || echo true)" \
  DEV_ENABLE_THROUGH_THE_SEASONS="$([ "$SEASONS_ENABLED" -eq 1 ] && echo true || echo false)" \
  DEV_ENABLE_FARMERS_OF_THE_MOOR="$([ "$MOOR_ENABLED" -eq 1 ] && echo true || echo false)" \
  DEV_ALLOW_INCOMPLETE_FARMERS_OF_THE_MOOR_MINOR_DEAL="$([ "$MOOR_ENABLED" -eq 1 ] && echo true || echo false)" \
  DEV_DRAFT_MODE="$([ "$DRAFT_ENABLED" -eq 1 ] && echo simultaneous || echo none)" \
  DEV_DRAFT_POOL_SIZE=7 \
  DB_DIR="$DB_DIR" \
  DB_PATH="$DB_PATH" \
  PERSISTED_ROOMS_DIR="$PERSISTED_ROOMS_DIR" \
  CUSTOM_CARD_DIR="$CUSTOM_CARD_DIR" \
  CARD_ART_DIR="$CARD_ART_DIR" \
  REPLAY_NEW_ROOMS_ENABLED="${REPLAY_NEW_ROOMS_ENABLED:-true}" \
  REPLAY_VIEWER_BUILD_ID="$REPLAY_VIEWER_BUILD_ID" \
  REPLAY_VIEWER_ROOT="$REPLAY_VIEWER_ROOT" \
  REPLAY_ASSET_ROOT="$REPLAY_ASSET_ROOT" \
  REPLAY_REMOVAL_LEDGER_PATH="$REPLAY_REMOVAL_LEDGER_PATH" \
  GAME_BUILD_ID="$GAME_BUILD_ID" \
  "$BACKEND_BIN" "$SCRIPT_DIR/server/index.ts"

if [ "$PREVIEW_ENABLED" -eq 1 ]; then
  echo "Starting frontend preview (port $FRONTEND_PORT on $BIND_IP)..."
  start_and_wait "frontend" "$FRONTEND_PORT" "$FRONTEND_LOG" env \
    VITE_API_BASE="http://$BIND_IP:$BACKEND_PORT" \
    VITE_WS_BASE="ws://$BIND_IP:$BACKEND_PORT/ws" \
    VITE_ENABLE_DEV_AUTH_SHORTCUTS=1 \
    "$FRONTEND_BIN" preview --host "$BIND_IP" --port "$FRONTEND_PORT" --strictPort
else
  echo "Starting frontend (port $FRONTEND_PORT on $BIND_IP)..."
  start_and_wait "frontend" "$FRONTEND_PORT" "$FRONTEND_LOG" env \
    NODE_ENV=development \
    BACKEND_HOST="$BIND_IP" \
    VITE_ENABLE_DEV_AUTH_SHORTCUTS=1 \
    "$FRONTEND_BIN" --host "$BIND_IP" --port "$FRONTEND_PORT" --strictPort
fi

echo ""
echo "Persistent dev state:"
echo "  DB_DIR             = $DB_DIR"
echo "  DB_PATH            = $DB_PATH"
echo "  PERSISTED_ROOMS_DIR= $PERSISTED_ROOMS_DIR"
echo "  CARD_ART_DIR       = $CARD_ART_DIR"
echo "  REPLAY_VIEWER_ROOT = $REPLAY_VIEWER_ROOT"
echo "  REPLAY_VIEWER_ID   = $REPLAY_VIEWER_BUILD_ID"
echo "  REPLAY_ASSET_ROOT  = $REPLAY_ASSET_ROOT"
echo "  REPLAY_REMOVAL_LEDGER_PATH = $REPLAY_REMOVAL_LEDGER_PATH"
echo "  FRONTEND_MODE      = $([ "$PREVIEW_ENABLED" -eq 1 ] && echo preview || echo dev)"
[ "$SCRIPT_DIR" != "$MAIN_REPO_DIR" ] && echo "  (running from worktree; anchored to main repo: $MAIN_REPO_DIR)"
echo ""
echo "=== Open Agricola (intranet) ==="
echo ""
echo "WS persistent dev rooms (each survives backend restart):"
DEV_ROOM_QUERY_SUFFIX=""
if [ "$PARENTS_ENABLED" -eq 1 ]; then
  DEV_ROOM_QUERY_SUFFIX="${DEV_ROOM_QUERY_SUFFIX}&enableParentCards=true"
  if [ "$DRAFT_ENABLED" -eq 0 ]; then
    DEV_ROOM_QUERY_SUFFIX="${DEV_ROOM_QUERY_SUFFIX}&draftParents=false"
  fi
fi
if [ "$SEASONS_ENABLED" -eq 1 ]; then
  DEV_ROOM_QUERY_SUFFIX="${DEV_ROOM_QUERY_SUFFIX}&enableThroughTheSeasons=true"
fi
if [ "$MOOR_ENABLED" -eq 1 ]; then
  DEV_ROOM_QUERY_SUFFIX="${DEV_ROOM_QUERY_SUFFIX}&enableFarmersOfTheMoor=true&allowIncompleteFarmersOfTheMoorMinorDeal=true"
fi
if [ "$DRAFT_ENABLED" -eq 1 ]; then
  DEV_ROOM_QUERY_SUFFIX="${DEV_ROOM_QUERY_SUFFIX}&draftMode=simultaneous&draftPoolSize=7"
fi
for n in 2 3 4 5 6; do
  marker=""
  if [ "$PLAYERS" = "$n" ]; then
    marker="    <-- selected (--players $n)"
  fi
  echo "  ${n}-player room (room=dev${n})${marker}"
  for ((i = 1; i <= n; i += 1)); do
    echo "    P${i}: http://${BIND_IP}:${FRONTEND_PORT}/?player=p${i}&transport=ws&room=dev${n}&devMode=1${DEV_ROOM_QUERY_SUFFIX}"
  done
done
echo ""
echo "HTTP single-player (debug, non-persistent):"
echo "  http://${BIND_IP}:${FRONTEND_PORT}/?player=p1"
echo ""
echo "Platform / workshop testing:"
echo "  Logged-in dev workshop (auth shortcut as p1):"
echo "    http://${BIND_IP}:${FRONTEND_PORT}/?page=workshop&player=p1&devMode=1"
echo "  Login page (real account/session flow):"
echo "    http://${BIND_IP}:${FRONTEND_PORT}/?page=login"
echo "  Logged-in dev lobby (auth shortcut as p1):"
echo "    http://${BIND_IP}:${FRONTEND_PORT}/?player=p1&devMode=1"
echo ""
echo "Logs:"
echo "  tail -f \"$BACKEND_LOG\""
echo "  tail -f \"$FRONTEND_LOG\""
echo "====================="

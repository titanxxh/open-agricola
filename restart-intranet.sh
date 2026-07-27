#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_BIN="$SCRIPT_DIR/node_modules/.bin/tsx"
FRONTEND_BIN="$SCRIPT_DIR/node_modules/.bin/vite"
PNPM_BIN="${PNPM_BIN:-pnpm}"
BACKEND_PORT=5175
FRONTEND_PORT=5173
BACKEND_LOG="$SCRIPT_DIR/backend.log"
FRONTEND_LOG="$SCRIPT_DIR/frontend.log"

# Local platform features (GitHub OAuth, community deck toggle, API bases, etc.)
# live in .env during development. Export them so both tsx and Vite see the
# same config when this script is used as the one-stop local launcher.
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$SCRIPT_DIR/.env"
  set +a
fi

# Anchor persistent dev state (sqlite DB, JSON room snapshots, custom cards,
# card art, BGA local images) to the MAIN repo even when we're running from
# a worktree. Without this, each worktree gets its own ./data and ./output,
# so fixed dev room game state diverges across worktrees.
#
# Override: pass the env var explicitly to escape this anchor (e.g.
#   DB_DIR=/tmp/foo PERSISTED_ROOMS_DIR=/tmp/bar ./restart-intranet.sh
# ).
MAIN_REPO_DIR="$(cd "$(dirname "$(git -C "$SCRIPT_DIR" rev-parse --path-format=absolute --git-common-dir)")" && pwd -P)"
SHARED_DATA_DIR="${SHARED_DATA_DIR:-$MAIN_REPO_DIR/data}"
SHARED_OUTPUT_DIR="${SHARED_OUTPUT_DIR:-$MAIN_REPO_DIR/output}"

DB_DIR="${DB_DIR:-$SHARED_DATA_DIR}"
DB_PATH="${DB_PATH:-$DB_DIR/open-agricola.db}"
PERSISTED_ROOMS_DIR="${PERSISTED_ROOMS_DIR:-$SHARED_OUTPUT_DIR}"
CUSTOM_CARD_DIR="${CUSTOM_CARD_DIR:-$SHARED_DATA_DIR/custom-cards}"
CARD_ART_DIR="${CARD_ART_DIR:-$SHARED_DATA_DIR/card-art}"
REPLAY_VIEWER_ROOT="${REPLAY_VIEWER_ROOT:-$SHARED_DATA_DIR/replay-viewers}"
REPLAY_ASSET_ROOT="${REPLAY_ASSET_ROOT:-$SHARED_DATA_DIR/replay-assets}"
# BGA images live as a sibling of the MAIN repo, not the worktree.
if [ -z "${BGA_IMAGE_DIR:-}" ]; then
  BGA_IMAGE_DIR="$(cd "$MAIN_REPO_DIR/.." 2>/dev/null && pwd)/bga-agricola/img"
fi

if [ ! -x "$BACKEND_BIN" ] || [ ! -x "$FRONTEND_BIN" ]; then
  echo "Error: dependencies are missing. Run: pnpm install"
  exit 1
fi

if ! command -v lsof >/dev/null 2>&1; then
  echo "Error: lsof is required but not installed."
  exit 1
fi

usage() {
  cat <<'EOF'
Usage: ./restart-intranet.sh [--kill-only|--kill_only|-k]
                             [--players N | -p N | --players=N | -p=N]
                             [--parents] [--seasons] [--moor] [--draft] [--preview]
                             [-h|--help]

Without flags: stop any process on the frontend/backend ports, then start
fresh backend (tsx) and frontend (vite) bound to the LAN IP. Five persistent
dev rooms (dev2 / dev3 / dev4 / dev5 / dev6) are created automatically; each survives
backend restarts independently.

  --kill-only, --kill_only, -k   Only stop existing listeners; do not start
                                 backend or frontend. Skips the LAN-IP check.
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

# LAN IPv4 for binding Vite / backend (macOS: en0; Linux: eth0)
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

  pids="$(list_listening_pids "$port")"
  if [ -z "$pids" ]; then
    echo "  No listeners on $label port $port"
    return 0
  fi

  echo "  Stopping $label listener(s) on port $port..."
  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    ps -p "$pid" -o pid=,command= || true
    kill "$pid" 2>/dev/null || true
  done <<EOF
$pids
EOF

  if wait_for_port_state "$port" "no" 20 0.5; then
    return 0
  fi

  echo "  Escalating to SIGKILL for $label port $port..."
  pids="$(list_listening_pids "$port")"
  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    kill -9 "$pid" 2>/dev/null || true
  done <<EOF
$pids
EOF

  if ! wait_for_port_state "$port" "no" 10 0.2; then
    echo "Error: failed to free $label port $port"
    return 1
  fi
}

dev_rooms_without_parent_cards() {
  DB_PATH="$DB_PATH" node <<'EOF'
const fs = require('node:fs')
const Database = require('better-sqlite3')

const dbPath = process.env.DB_PATH
if (!dbPath || !fs.existsSync(dbPath)) process.exit(0)

const db = new Database(dbPath, { readonly: true, fileMustExist: true })
try {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rooms'").get()
  if (!table) process.exit(0)
  const rows = db.prepare("SELECT id, state_json FROM rooms WHERE id IN ('dev2', 'dev3', 'dev4', 'dev5', 'dev6')").all()
  const missing = rows.filter((row) => {
    if (!row.state_json) return true
    try {
      return JSON.parse(row.state_json).enableParentCards !== true
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

dev_rooms_without_direct_parent_cards() {
  DB_PATH="$DB_PATH" node <<'EOF'
const fs = require('node:fs')
const Database = require('better-sqlite3')

const dbPath = process.env.DB_PATH
if (!dbPath || !fs.existsSync(dbPath)) process.exit(0)

const db = new Database(dbPath, { readonly: true, fileMustExist: true })
try {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rooms'").get()
  if (!table) process.exit(0)
  const rows = db.prepare("SELECT id, state_json FROM rooms WHERE id IN ('dev2', 'dev3', 'dev4', 'dev5', 'dev6')").all()
  const missing = rows.filter((row) => {
    if (!row.state_json) return true
    try {
      const state = JSON.parse(row.state_json)
      if (state.enableParentCards !== true) return true
      return !Array.isArray(state.players) || !state.players.every((player) =>
        player.parentCards && player.parentCards.mother && player.parentCards.father
      )
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

dev_rooms_without_through_the_seasons() {
  DB_PATH="$DB_PATH" node <<'EOF'
const fs = require('node:fs')
const Database = require('better-sqlite3')

const dbPath = process.env.DB_PATH
if (!dbPath || !fs.existsSync(dbPath)) process.exit(0)

const db = new Database(dbPath, { readonly: true, fileMustExist: true })
try {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rooms'").get()
  if (!table) process.exit(0)
  const rows = db.prepare("SELECT id, state_json FROM rooms WHERE id IN ('dev2', 'dev3', 'dev4', 'dev5', 'dev6')").all()
  const missing = rows.filter((row) => {
    if (!row.state_json) return true
    try {
      return JSON.parse(row.state_json).enableThroughTheSeasons !== true
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

dev_rooms_without_farmers_of_the_moor() {
  DB_PATH="$DB_PATH" node <<'EOF'
const fs = require('node:fs')
const Database = require('better-sqlite3')

const dbPath = process.env.DB_PATH
if (!dbPath || !fs.existsSync(dbPath)) process.exit(0)

const db = new Database(dbPath, { readonly: true, fileMustExist: true })
try {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rooms'").get()
  if (!table) process.exit(0)
  const rows = db.prepare("SELECT id, state_json FROM rooms WHERE id IN ('dev2', 'dev3', 'dev4', 'dev5', 'dev6')").all()
  const missing = rows.filter((row) => {
    if (!row.state_json) return true
    try {
      const state = JSON.parse(row.state_json)
      return state.enableFarmersOfTheMoor !== true
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

start_and_wait() {
  local label="$1"
  local port="$2"
  local log_file="$3"
  shift 3

  : > "$log_file"
  if command -v setsid >/dev/null 2>&1; then
    setsid "$@" > "$log_file" 2>&1 &
  else
    nohup "$@" > "$log_file" 2>&1 &
  fi
  local pid=$!
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

if [ "$KILL_ONLY" -eq 1 ]; then
  echo "Stopping existing processes (kill-only)..."
  stop_port_listeners "$FRONTEND_PORT" "frontend"
  stop_port_listeners "$BACKEND_PORT" "backend"
  echo "Done. Ports $FRONTEND_PORT / $BACKEND_PORT cleared."
  exit 0
fi

echo "Ensuring immutable replay viewer..."
REPLAY_VIEWER_BUILD_ID="${REPLAY_VIEWER_BUILD_ID:-$(
  env REPLAY_VIEWER_ROOT="$REPLAY_VIEWER_ROOT" "$PNPM_BIN" run build:replay-viewer | tail -n 1
)}"
GAME_BUILD_ID="${GAME_BUILD_ID:-$(git -C "$SCRIPT_DIR" rev-parse HEAD)}"

LAN_IP=$(get_lan_ip)
if [ -z "$LAN_IP" ]; then
  echo "Error: could not get LAN IP. On macOS use en0 (ipconfig getifaddr en0); on Linux ensure eth0 exists."
  exit 1
fi

RESET_CONFIRMED=0
RESET_REASON=""
if [ "$DRAFT_ENABLED" -eq 1 ]; then
  RESET_REASON="--draft starts fixed dev rooms from the draft phase."
else
  RESET_REASONS=()
  if [ "$PARENTS_ENABLED" -eq 1 ]; then
    if [ "$DRAFT_ENABLED" -eq 1 ]; then
      MISSING_PARENT_ROOMS="$(dev_rooms_without_parent_cards)"
    else
      MISSING_PARENT_ROOMS="$(dev_rooms_without_direct_parent_cards)"
    fi
    if [ -n "$MISSING_PARENT_ROOMS" ]; then
      RESET_REASONS+=("existing fixed dev room(s) are not Parent Cards games: $MISSING_PARENT_ROOMS.")
    fi
  fi
  if [ "$SEASONS_ENABLED" -eq 1 ]; then
    MISSING_SEASONS_ROOMS="$(dev_rooms_without_through_the_seasons)"
    if [ -n "$MISSING_SEASONS_ROOMS" ]; then
      RESET_REASONS+=("existing fixed dev room(s) are not Through the Seasons games: $MISSING_SEASONS_ROOMS.")
    fi
  fi
  if [ "$MOOR_ENABLED" -eq 1 ]; then
    MISSING_MOOR_ROOMS="$(dev_rooms_without_farmers_of_the_moor)"
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

echo "Using LAN IP: $LAN_IP"
PUBLIC_API_BASE="${PUBLIC_API_BASE:-http://$LAN_IP:$BACKEND_PORT}"
echo "Stopping existing processes..."
stop_port_listeners "$FRONTEND_PORT" "frontend"
stop_port_listeners "$BACKEND_PORT" "backend"

if [ "$RESET_CONFIRMED" -eq 1 ]; then
  echo "Resetting fixed dev rooms..."
  reset_persisted_dev_rooms
fi

if [ "$PREVIEW_ENABLED" -eq 1 ]; then
  echo "Building frontend preview bundle..."
  if [ -n "${BGA_CDN_BASE_URL:-}" ]; then
    env \
      VITE_API_BASE="http://$LAN_IP:$BACKEND_PORT" \
      VITE_WS_BASE="ws://$LAN_IP:$BACKEND_PORT/ws" \
      VITE_ENABLE_DEV_AUTH_SHORTCUTS=1 \
      BGA_CDN_BASE_URL="$BGA_CDN_BASE_URL" \
      "$PNPM_BIN" run build
  else
    if [ ! -d "$BGA_IMAGE_DIR" ]; then
      echo "Error: BGA_IMAGE_DIR does not exist: $BGA_IMAGE_DIR"
      exit 1
    fi
    env \
      VITE_API_BASE="http://$LAN_IP:$BACKEND_PORT" \
      VITE_WS_BASE="ws://$LAN_IP:$BACKEND_PORT/ws" \
      VITE_ENABLE_DEV_AUTH_SHORTCUTS=1 \
      "$PNPM_BIN" run build
    rm -rf "$SCRIPT_DIR/dist/bga-img"
    mkdir -p "$SCRIPT_DIR/dist/bga-img"
    cp -R "$BGA_IMAGE_DIR"/. "$SCRIPT_DIR/dist/bga-img"/
  fi
fi

echo "Starting backend (port $BACKEND_PORT on $LAN_IP, dev2/dev3/dev4/dev5/dev6 persisted via SQLite)..."
start_and_wait "backend" "$BACKEND_PORT" "$BACKEND_LOG" env \
  NODE_ENV=development \
  PERSIST_ROOMS=sqlite \
  ALLOW_ANONYMOUS_WS=true \
  ENABLE_AUTH_TEST_HELPERS=1 \
  BACKEND_HOST="$LAN_IP" \
  CORS_ORIGIN="http://$LAN_IP:$FRONTEND_PORT" \
  PUBLIC_API_BASE="$PUBLIC_API_BASE" \
  PUBLIC_APP_ORIGIN="http://$LAN_IP:$FRONTEND_PORT" \
  DEV_ENABLE_PARENT_CARDS="$([ "$PARENTS_ENABLED" -eq 1 ] && echo true || echo false)" \
  DEV_DRAFT_PARENTS="$([ "$PARENTS_ENABLED" -eq 1 ] && [ "$DRAFT_ENABLED" -eq 0 ] && echo false || echo true)" \
  DEV_ENABLE_THROUGH_THE_SEASONS="$([ "$SEASONS_ENABLED" -eq 1 ] && echo true || echo false)" \
  DEV_ENABLE_FARMERS_OF_THE_MOOR="$([ "$MOOR_ENABLED" -eq 1 ] && echo true || echo false)" \
  DEV_ALLOW_INCOMPLETE_FARMERS_OF_THE_MOOR_MINOR_DEAL="$([ "$MOOR_ENABLED" -eq 1 ] && echo true || echo false)" \
  DEV_DRAFT_MODE="$([ "$DRAFT_ENABLED" -eq 1 ] && echo simultaneous || echo none)" \
  DEV_DRAFT_POOL_SIZE=7 \
  BGA_IMAGE_DIR="$BGA_IMAGE_DIR" \
  DB_DIR="$DB_DIR" \
  DB_PATH="$DB_PATH" \
  PERSISTED_ROOMS_DIR="$PERSISTED_ROOMS_DIR" \
  CUSTOM_CARD_DIR="$CUSTOM_CARD_DIR" \
  CARD_ART_DIR="$CARD_ART_DIR" \
  REPLAY_NEW_ROOMS_ENABLED="${REPLAY_NEW_ROOMS_ENABLED:-true}" \
  REPLAY_VIEWER_BUILD_ID="$REPLAY_VIEWER_BUILD_ID" \
  REPLAY_VIEWER_ROOT="$REPLAY_VIEWER_ROOT" \
  REPLAY_ASSET_ROOT="$REPLAY_ASSET_ROOT" \
  GAME_BUILD_ID="$GAME_BUILD_ID" \
  "$BACKEND_BIN" "$SCRIPT_DIR/server/index.ts"

if [ "$PREVIEW_ENABLED" -eq 1 ]; then
  echo "Starting frontend preview (port $FRONTEND_PORT on $LAN_IP)..."
  start_and_wait "frontend" "$FRONTEND_PORT" "$FRONTEND_LOG" env \
    VITE_API_BASE="http://$LAN_IP:$BACKEND_PORT" \
    VITE_WS_BASE="ws://$LAN_IP:$BACKEND_PORT/ws" \
    VITE_ENABLE_DEV_AUTH_SHORTCUTS=1 \
    "$FRONTEND_BIN" preview --host "$LAN_IP" --port "$FRONTEND_PORT" --strictPort
else
  echo "Starting frontend (port $FRONTEND_PORT on $LAN_IP)..."
  start_and_wait "frontend" "$FRONTEND_PORT" "$FRONTEND_LOG" env \
    NODE_ENV=development \
    BACKEND_HOST="$LAN_IP" \
    VITE_ENABLE_DEV_AUTH_SHORTCUTS=1 \
    BGA_IMAGE_DIR="$BGA_IMAGE_DIR" \
    "$FRONTEND_BIN" --host "$LAN_IP" --port "$FRONTEND_PORT" --strictPort
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
echo "  BGA_IMAGE_DIR      = $BGA_IMAGE_DIR"
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
    echo "    P${i}: http://${LAN_IP}:5173/?player=p${i}&transport=ws&room=dev${n}&devMode=1${DEV_ROOM_QUERY_SUFFIX}"
  done
done
echo ""
echo "HTTP single-player (debug, non-persistent):"
echo "  http://${LAN_IP}:5173/?player=p1"
echo ""
echo "Platform / workshop testing:"
echo "  Logged-in dev workshop (auth shortcut as p1):"
echo "    http://${LAN_IP}:5173/?page=workshop&player=p1&devMode=1"
echo "  Login page (real account/session flow):"
echo "    http://${LAN_IP}:5173/?page=login"
echo "  Logged-in dev lobby (auth shortcut as p1):"
echo "    http://${LAN_IP}:5173/?player=p1&devMode=1"
echo ""
echo "Logs:"
echo "  tail -f \"$BACKEND_LOG\""
echo "  tail -f \"$FRONTEND_LOG\""
echo "====================="

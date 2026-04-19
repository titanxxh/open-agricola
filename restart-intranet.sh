#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_BIN="$SCRIPT_DIR/node_modules/.bin/tsx"
FRONTEND_BIN="$SCRIPT_DIR/node_modules/.bin/vite"
BACKEND_PORT=5175
FRONTEND_PORT=5173
BACKEND_LOG="$SCRIPT_DIR/backend.log"
FRONTEND_LOG="$SCRIPT_DIR/frontend.log"
# Local BGA image directory (sibling repo). Vite + backend will serve
# /bga-img/* from here first, falling back to the BGA CDN if missing.
BGA_IMAGE_DIR="${BGA_IMAGE_DIR:-../bga-agricola/img}"

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
                             [-h|--help]

Without flags: stop any process on the frontend/backend ports, then start
fresh backend (tsx) and frontend (vite) bound to the LAN IP. Three persistent
dev rooms (dev2 / dev3 / dev4) are created automatically; each survives
backend restarts independently.

  --kill-only, --kill_only, -k   Only stop existing listeners; do not start
                                 backend or frontend. Skips the LAN-IP check.
  --players N, -p N              Pick the dev room for N players (2/3/4).
                                 Defaults to 4. Links for all three rooms are
                                 always printed; the selected one is marked.
  -h, --help                     Show this help.
EOF
}

KILL_ONLY=0
PLAYERS="4"
while [ $# -gt 0 ]; do
  case "$1" in
    --kill-only|--kill_only|-k)
      KILL_ONLY=1
      shift
      ;;
    --players|-p)
      if [ $# -lt 2 ]; then
        echo "Error: $1 requires a value (2, 3 or 4)."
        exit 1
      fi
      PLAYERS="$2"
      shift 2
      ;;
    --players=*|-p=*)
      PLAYERS="${1#*=}"
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
  2|3|4) ;;
  *)
    echo "Error: --players must be 2, 3, or 4 (got: $PLAYERS)"
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

start_and_wait() {
  local label="$1"
  local port="$2"
  local log_file="$3"
  shift 3

  : > "$log_file"
  nohup "$@" > "$log_file" 2>&1 &
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

LAN_IP=$(get_lan_ip)
if [ -z "$LAN_IP" ]; then
  echo "Error: could not get LAN IP. On macOS use en0 (ipconfig getifaddr en0); on Linux ensure eth0 exists."
  exit 1
fi

echo "Using LAN IP: $LAN_IP"
echo "Stopping existing processes..."
stop_port_listeners "$FRONTEND_PORT" "frontend"
stop_port_listeners "$BACKEND_PORT" "backend"

echo "Starting backend (port $BACKEND_PORT on $LAN_IP, dev2/dev3/dev4 persisted via SQLite)..."
start_and_wait "backend" "$BACKEND_PORT" "$BACKEND_LOG" env \
  PERSIST_ROOMS=sqlite \
  ALLOW_ANONYMOUS_WS=true \
  BACKEND_HOST="$LAN_IP" \
  BGA_IMAGE_DIR="$BGA_IMAGE_DIR" \
  "$BACKEND_BIN" "$SCRIPT_DIR/server/index.ts"

echo "Starting frontend (port $FRONTEND_PORT on $LAN_IP)..."
start_and_wait "frontend" "$FRONTEND_PORT" "$FRONTEND_LOG" env \
  BACKEND_HOST="$LAN_IP" \
  BGA_IMAGE_DIR="$BGA_IMAGE_DIR" \
  "$FRONTEND_BIN" --host "$LAN_IP" --port "$FRONTEND_PORT" --strictPort

echo ""
echo "=== Open Agricola (intranet) ==="
echo ""
echo "WS persistent dev rooms (each survives backend restart):"
for n in 2 3 4; do
  marker=""
  if [ "$PLAYERS" = "$n" ]; then
    marker="    <-- selected (--players $n)"
  fi
  echo "  ${n}-player room (room=dev${n})${marker}"
  for ((i = 1; i <= n; i += 1)); do
    echo "    P${i}: http://${LAN_IP}:5173/?player=p${i}&transport=ws&room=dev${n}"
  done
done
echo ""
echo "HTTP single-player (debug, non-persistent):"
echo "  http://${LAN_IP}:5173/?player=p1"
echo ""
echo "Logs:"
echo "  tail -f \"$BACKEND_LOG\""
echo "  tail -f \"$FRONTEND_LOG\""
echo "====================="

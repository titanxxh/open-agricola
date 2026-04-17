#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_BIN="$SCRIPT_DIR/node_modules/.bin/tsx"
FRONTEND_BIN="$SCRIPT_DIR/node_modules/.bin/vite"
BACKEND_PORT=5175
FRONTEND_PORT=5173
BACKEND_LOG="$SCRIPT_DIR/backend.log"
FRONTEND_LOG="$SCRIPT_DIR/frontend.log"

if [ ! -x "$BACKEND_BIN" ] || [ ! -x "$FRONTEND_BIN" ]; then
  echo "Error: dependencies are missing. Run: pnpm install"
  exit 1
fi

if ! command -v lsof >/dev/null 2>&1; then
  echo "Error: lsof is required but not installed."
  exit 1
fi

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
  local port="$1"
  lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u
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

LAN_IP=$(get_lan_ip)
if [ -z "$LAN_IP" ]; then
  echo "Error: could not get LAN IP. On macOS use en0 (ipconfig getifaddr en0); on Linux ensure eth0 exists."
  exit 1
fi

echo "Using LAN IP: $LAN_IP"
echo "Stopping existing processes..."
stop_port_listeners "$FRONTEND_PORT" "frontend"
stop_port_listeners "$BACKEND_PORT" "backend"

echo "Starting backend (port $BACKEND_PORT on $LAN_IP, persistent dev room via SQLite)..."
start_and_wait "backend" "$BACKEND_PORT" "$BACKEND_LOG" env \
  PERSIST_ROOMS=sqlite \
  ALLOW_ANONYMOUS_WS=true \
  PERSISTENT_ROOM_ID=dev \
  BACKEND_HOST="$LAN_IP" \
  "$BACKEND_BIN" "$SCRIPT_DIR/server/index.ts"

echo "Starting frontend (port $FRONTEND_PORT on $LAN_IP)..."
start_and_wait "frontend" "$FRONTEND_PORT" "$FRONTEND_LOG" env \
  BACKEND_HOST="$LAN_IP" \
  "$FRONTEND_BIN" --host "$LAN_IP" --port "$FRONTEND_PORT" --strictPort

echo ""
echo "=== Open Agricola (intranet) ==="
echo ""
echo "WS multi-player (persistent room, survives backend restart):"
echo "  P1: http://${LAN_IP}:5173/?player=p1&transport=ws&room=dev"
echo "  P2: http://${LAN_IP}:5173/?player=p2&transport=ws&room=dev"
echo ""
echo "HTTP single-player (debug):"
echo "  http://${LAN_IP}:5173/?player=p1"
echo ""
echo "Logs:"
echo "  tail -f \"$BACKEND_LOG\""
echo "  tail -f \"$FRONTEND_LOG\""
echo "====================="

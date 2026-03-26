#!/bin/bash
set -e

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

LAN_IP=$(get_lan_ip)
if [ -z "$LAN_IP" ]; then
  echo "Error: could not get LAN IP. On macOS use en0 (ipconfig getifaddr en0); on Linux ensure eth0 exists."
  exit 1
fi

echo "Using LAN IP: $LAN_IP"
echo "Stopping existing processes..."
pkill -f "vite" 2>/dev/null || true
pkill -f "tsx server/index.ts" 2>/dev/null || true
sleep 1

echo "Starting backend (port 5175 on $LAN_IP)..."
BACKEND_HOST="$LAN_IP" nohup npm run server > backend.log 2>&1 &
echo "  PID: $!"

echo "Starting frontend (port 5173 on $LAN_IP)..."
nohup npx vite --host "$LAN_IP" > frontend.log 2>&1 &
echo "  PID: $!"

sleep 2

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
echo "  tail -f backend.log"
echo "  tail -f frontend.log"
echo "====================="

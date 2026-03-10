#!/bin/bash
set -e

# Get eth0 IPv4 address (skip loopback and CIDR suffix)
get_eth0_ip() {
  ip -4 addr show eth0 2>/dev/null | grep -E '^\s+inet ' | awk '{print $2}' | cut -d/ -f1
}

ETH0_IP=$(get_eth0_ip)
if [ -z "$ETH0_IP" ]; then
  echo "Error: could not get eth0 IP. Is eth0 available?"
  exit 1
fi

echo "Using eth0 IP: $ETH0_IP"
echo "Stopping existing processes..."
pkill -f "vite" 2>/dev/null || true
pkill -f "tsx server/index.ts" 2>/dev/null || true
sleep 1

echo "Starting backend (port 5175 on $ETH0_IP)..."
BACKEND_HOST="$ETH0_IP" nohup npm run server > backend.log 2>&1 &
echo "  PID: $!"

echo "Starting frontend (port 5173 on $ETH0_IP)..."
nohup npx vite --host "$ETH0_IP" > frontend.log 2>&1 &
echo "  PID: $!"

sleep 2

echo ""
echo "=== Open Agricola (intranet) ==="
echo ""
echo "WS multi-player (persistent room, survives backend restart):"
echo "  P1: http://${ETH0_IP}:5173/?player=p1&transport=ws&room=dev"
echo "  P2: http://${ETH0_IP}:5173/?player=p2&transport=ws&room=dev"
echo ""
echo "HTTP single-player (debug):"
echo "  http://${ETH0_IP}:5173/?player=p1"
echo ""
echo "Logs:"
echo "  tail -f backend.log"
echo "  tail -f frontend.log"
echo "====================="

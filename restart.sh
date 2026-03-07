#!/bin/bash
set -e

echo "Stopping existing processes..."
pkill -f "vite" 2>/dev/null || true
pkill -f "tsx server/index.ts" 2>/dev/null || true
sleep 1

echo "Starting backend (port 5175)..."
nohup npm run server > backend.log 2>&1 &
echo "  PID: $!"

echo "Starting frontend (port 5173)..."
nohup npm run dev > frontend.log 2>&1 &
echo "  PID: $!"

sleep 2

echo ""
echo "=== Open Agricola ==="
echo ""
echo "WS multi-player (recommended):"
echo "  P1: http://localhost:5173/?player=p1&transport=ws"
echo "  P2: http://localhost:5173/?player=p2&transport=ws"
echo ""
echo "HTTP single-player (debug):"
echo "  http://localhost:5173/?player=p1"
echo ""
echo "Logs:"
echo "  tail -f backend.log"
echo "  tail -f frontend.log"
echo "====================="

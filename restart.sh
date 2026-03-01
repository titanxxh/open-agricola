#!/bin/bash

echo "Stopping existing frontend and backend processes..."
# Kill vite frontend
pkill -f "vite" || true
# Kill tsx backend
pkill -f "tsx server/index.ts" || true
# Sleep a moment to let processes terminate
sleep 1

echo "Starting backend (npm run server)..."
nohup npm run server > backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend started with PID: $BACKEND_PID"

echo "Starting frontend (npm run dev)..."
nohup npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend started with PID: $FRONTEND_PID"

echo "====================================="
echo "Both servers have been restarted!"
echo "To view frontend logs, run: tail -f frontend.log"
echo "To view backend logs, run:  tail -f backend.log"
echo "====================================="

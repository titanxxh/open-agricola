#!/bin/bash

# Bugfix branch: Frontend=5174, Backend=5176 (main uses 5173/5175)

FRONTEND_PORT=5174
BACKEND_PORT=5176

echo "=== Bugfix Branch Server Restart ==="
echo "Frontend port: $FRONTEND_PORT"
echo "Backend port: $BACKEND_PORT"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

kill_port() {
    local port=$1
    local pids=$(lsof -t -i:$port 2>/dev/null)
    if [ -n "$pids" ]; then
        echo "Killing processes on port $port"
        kill $pids 2>/dev/null || true
        sleep 1
        pids=$(lsof -t -i:$port 2>/dev/null)
        [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
        sleep 1
    fi
}

echo ""
echo "Stopping existing services..."
kill_port $FRONTEND_PORT
kill_port $BACKEND_PORT

echo ""
echo "Starting backend server on port $BACKEND_PORT..."
BACKEND_PORT=$BACKEND_PORT API_BASE="http://localhost:$BACKEND_PORT" \
    nohup npx tsx server/index.ts > /tmp/agricola-bugfix-backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

sleep 2

if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "ERROR: Backend failed to start. Check /tmp/agricola-bugfix-backend.log"
    exit 1
fi

echo ""
echo "Starting frontend server on port $FRONTEND_PORT..."
VITE_API_BASE="http://localhost:$BACKEND_PORT" \
    nohup npx vite --port $FRONTEND_PORT > /tmp/agricola-bugfix-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

sleep 3

if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo "ERROR: Frontend failed to start. Check /tmp/agricola-bugfix-frontend.log"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

echo ""
echo "=== Services Started ==="
echo "Frontend: http://localhost:$FRONTEND_PORT"
echo "Backend:  http://localhost:$BACKEND_PORT"
echo ""
echo "Logs: /tmp/agricola-bugfix-{frontend,backend}.log"
echo "Stop: kill $FRONTEND_PID $BACKEND_PID"

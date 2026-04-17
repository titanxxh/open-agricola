#!/bin/bash
# Usage: pnpm run verify -- [playwright args]
# Starts fresh servers, runs Playwright E2E tests, cleans up.
set -e

BACKEND_PORT=5175
FRONTEND_PORT=5173
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo ">>> Cleaning up..."
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  # Kill any remaining processes on the ports
  lsof -ti :"$BACKEND_PORT" 2>/dev/null | xargs kill 2>/dev/null || true
  lsof -ti :"$FRONTEND_PORT" 2>/dev/null | xargs kill 2>/dev/null || true
}

trap cleanup EXIT

# Kill any existing servers on our ports
echo ">>> Killing existing servers on ports $BACKEND_PORT and $FRONTEND_PORT..."
lsof -ti :"$BACKEND_PORT" 2>/dev/null | xargs kill 2>/dev/null || true
lsof -ti :"$FRONTEND_PORT" 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1

# Start backend (disable rate limiting for test runs)
echo ">>> Starting backend on port $BACKEND_PORT..."
DISABLE_RATE_LIMIT=1 pnpm run server > /dev/null 2>&1 &
BACKEND_PID=$!

# Start frontend
echo ">>> Starting frontend on port $FRONTEND_PORT..."
pnpm exec vite > /dev/null 2>&1 &
FRONTEND_PID=$!

# Health check: backend
echo ">>> Waiting for backend..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$BACKEND_PORT/api/health" > /dev/null 2>&1; then
    echo ">>> Backend ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo ">>> ERROR: Backend did not start within 30 seconds."
    exit 1
  fi
  sleep 1
done

# Health check: frontend
echo ">>> Waiting for frontend..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$FRONTEND_PORT" > /dev/null 2>&1; then
    echo ">>> Frontend ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo ">>> ERROR: Frontend did not start within 30 seconds."
    exit 1
  fi
  sleep 1
done

# Run Playwright tests (pass through all arguments)
# Disable set -e so we can capture the exit code
echo ">>> Running Playwright tests..."
set +e
pnpm exec playwright test "$@"
TEST_EXIT=$?
set -e

echo ">>> Tests finished with exit code $TEST_EXIT"
exit $TEST_EXIT

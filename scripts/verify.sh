#!/bin/bash
# Usage: pnpm run verify -- [playwright args]
# Starts fresh servers, runs Playwright E2E tests, cleans up.
set -euo pipefail

BACKEND_PORT="${BACKEND_PORT:-5175}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
BACKEND_PID=""
FRONTEND_PID=""
TEST_RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/open-agricola-e2e.XXXXXX")"

export NODE_ENV=test
export ACCOUNT_REGISTRATION_POLICY=open
export ENABLE_AUTH_TEST_HELPERS=1
export ALLOW_ANONYMOUS_WS=true
export DISABLE_RATE_LIMIT=1
export WORKSHOP_PR_MOCK_MODE=true
export BACKEND_HOST=127.0.0.1
export BACKEND_PORT
export FRONTEND_URL="http://127.0.0.1:$FRONTEND_PORT"
export BACKEND_URL="http://127.0.0.1:$BACKEND_PORT"
export VITE_API_BASE="$BACKEND_URL"
export VITE_WS_BASE="ws://127.0.0.1:$BACKEND_PORT/ws"
export VITE_SANDBOX_EXECUTOR="${VITE_SANDBOX_EXECUTOR:-server}"
export CORS_ORIGIN="$FRONTEND_URL"
export PUBLIC_APP_ORIGIN="$FRONTEND_URL"
export PUBLIC_API_BASE="$BACKEND_URL"
export DB_PATH="${DB_PATH:-$TEST_RUN_DIR/e2e.sqlite}"
export CARD_ART_DIR="${CARD_ART_DIR:-$TEST_RUN_DIR/card-art}"
export REPLAY_ASSET_ROOT="${REPLAY_ASSET_ROOT:-$TEST_RUN_DIR/replay-assets}"
export PERSISTED_ROOMS_DIR="${PERSISTED_ROOMS_DIR:-$TEST_RUN_DIR/rooms}"
export REPLAY_REMOVAL_LEDGER_PATH="${REPLAY_REMOVAL_LEDGER_PATH:-$TEST_RUN_DIR/replay-removals.jsonl}"
export REPLAY_VIEWER_ROOT="${REPLAY_VIEWER_ROOT:-$TEST_RUN_DIR/replay-viewers}"

if [ "${1:-}" = "--" ]; then
  shift
fi

cleanup() {
  echo ">>> Cleaning up..."
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  rm -rf -- "$TEST_RUN_DIR"
}

trap cleanup EXIT

if lsof -ti :"$BACKEND_PORT" -i :"$FRONTEND_PORT" >/dev/null 2>&1; then
  echo ">>> ERROR: Port $BACKEND_PORT or $FRONTEND_PORT is already in use."
  exit 1
fi

if [ -z "${REPLAY_VIEWER_BUILD_ID:-}" ]; then
  echo ">>> Building replay viewer..."
  REPLAY_VIEWER_BUILD_ID="$(
    REPLAY_VIEWER_ROOT="$REPLAY_VIEWER_ROOT" pnpm run build:replay-viewer | tail -n 1
  )"
  export REPLAY_VIEWER_BUILD_ID
fi

if [[ ! "$REPLAY_VIEWER_BUILD_ID" =~ ^[a-f0-9]{64}$ ]]; then
  echo ">>> ERROR: Replay viewer build id is invalid."
  exit 1
fi

echo ">>> Starting backend on port $BACKEND_PORT..."
pnpm run server > "$TEST_RUN_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

echo ">>> Starting frontend on port $FRONTEND_PORT..."
pnpm exec vite --host 127.0.0.1 --port "$FRONTEND_PORT" --strictPort > "$TEST_RUN_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!

echo ">>> Waiting for backend..."
for i in $(seq 1 30); do
  if curl -sf "$BACKEND_URL/api/health" > /dev/null 2>&1; then
    echo ">>> Backend ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo ">>> ERROR: Backend did not start within 30 seconds."
    tail -n 80 "$TEST_RUN_DIR/backend.log"
    exit 1
  fi
  sleep 1
done

echo ">>> Waiting for frontend..."
for i in $(seq 1 30); do
  if curl -sf "$FRONTEND_URL" > /dev/null 2>&1; then
    echo ">>> Frontend ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo ">>> ERROR: Frontend did not start within 30 seconds."
    tail -n 80 "$TEST_RUN_DIR/frontend.log"
    exit 1
  fi
  sleep 1
done

echo ">>> Running Playwright tests..."
set +e
pnpm exec playwright test "$@"
TEST_EXIT=$?
set -e

echo ">>> Tests finished with exit code $TEST_EXIT"
exit $TEST_EXIT

#!/usr/bin/env bash
# pnpm run verify -- [Playwright args]; real isolated PostgreSQL + S3 namespaces.
set -euo pipefail
cd "$(dirname "$0")/.."
TEST_RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/open-agricola-e2e.XXXXXX")"
umask 077
node scripts/local-services.mjs --test
pnpm exec tsx scripts/test-environment.ts create "$TEST_RUN_DIR"
set -a
# shellcheck disable=SC1090
. "$TEST_RUN_DIR/test.env"
set +a
STARTED=0
cleanup() {
  status=$?
  if [[ "$STARTED" == 1 ]]; then ./restart-local.sh --kill-only >/dev/null 2>&1 || true; fi
  pnpm exec tsx scripts/test-environment.ts cleanup "$TEST_RUN_DIR" || status=1
  if [[ "$status" == 0 ]]; then rm -rf -- "$TEST_RUN_DIR";
  else
    rm -f -- "$TEST_RUN_DIR/test.env" "$TEST_RUN_DIR/dependencies.local" "$TEST_RUN_DIR/dependencies.compose.env"
    echo "Test logs retained at: $TEST_RUN_DIR"
  fi
  exit "$status"
}
trap cleanup EXIT
if lsof -ti :"$BACKEND_PORT" -i :"$FRONTEND_PORT" >/dev/null 2>&1; then
  echo 'Selected test ports are already in use'; exit 1
fi
[[ "${1:-}" != -- ]] || shift
STARTED=1
./restart-local.sh --instances "${APP_INSTANCES:-1}"
pnpm exec playwright test "$@"

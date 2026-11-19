#!/usr/bin/env bash
set -euo pipefail
# Trusted owner checkout only; all validation is in the TypeScript CLI.
cd "$(dirname "$0")"
if [[ "${1:-}" == update ]]; then
  shift
  exec node --import tsx scripts/prerelease/source-update.mjs "$@"
fi
exec node --import tsx scripts/prerelease/operations.ts "$@"

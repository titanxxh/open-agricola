#!/usr/bin/env bash
set -euo pipefail
# Trusted owner checkout only; all validation is in the TypeScript CLI.
cd "$(dirname "$0")"
exec node --import tsx scripts/prerelease/operations.ts "$@"

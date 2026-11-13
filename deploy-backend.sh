#!/usr/bin/env bash
# Owner-only fixed-image delivery; production never installs or builds application code.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
exec node scripts/release/backend-image.ts "$@"

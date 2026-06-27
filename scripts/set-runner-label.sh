#!/bin/bash
set -euo pipefail

usage() {
  echo "Usage: $0 github|self-hosted"
  echo "  github      -> RUNNER_LABEL=ubuntu-latest"
  echo "  self-hosted -> RUNNER_LABEL=self-hosted"
}

case "${1:-}" in
  --)
    shift
    ;;
esac

case "${1:-}" in
  github | github-hosted | ubuntu-latest)
    LABEL="ubuntu-latest"
    ;;
  self-hosted | selfhosted)
    LABEL="self-hosted"
    ;;
  *)
    usage
    exit 2
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REPO="${GITHUB_REPOSITORY:-titanxxh/open-agricola}"

cd "$PROJECT_ROOT"

if [ -z "${GH_TOKEN:-}" ] && [ -z "${GITHUB_TOKEN:-}" ] && [ -f .env ]; then
  TOKEN_LINE="$(grep -E '^(export[[:space:]]+)?(GH_TOKEN|GITHUB_TOKEN)=' .env | head -n 1 || true)"
  if [ -n "$TOKEN_LINE" ]; then
    TOKEN_LINE="${TOKEN_LINE#export }"
    TOKEN_KEY="${TOKEN_LINE%%=*}"
    TOKEN_VALUE="${TOKEN_LINE#*=}"
    TOKEN_VALUE="${TOKEN_VALUE%$'\r'}"
    if [[ "$TOKEN_VALUE" == \"*\" && "$TOKEN_VALUE" == *\" ]]; then
      TOKEN_VALUE="${TOKEN_VALUE:1:${#TOKEN_VALUE}-2}"
    elif [[ "$TOKEN_VALUE" == \'*\' && "$TOKEN_VALUE" == *\' ]]; then
      TOKEN_VALUE="${TOKEN_VALUE:1:${#TOKEN_VALUE}-2}"
    fi
    export "$TOKEN_KEY=$TOKEN_VALUE"
  fi
fi

if [ -z "${GH_TOKEN:-}" ] && [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "ERROR: GH_TOKEN or GITHUB_TOKEN is required. Put it in .env or export it first." >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI is required." >&2
  exit 1
fi

gh variable set RUNNER_LABEL --repo "$REPO" --body "$LABEL"
echo "RUNNER_LABEL=$LABEL"

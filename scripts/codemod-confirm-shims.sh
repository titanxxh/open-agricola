#!/usr/bin/env bash
# Codemod: replace session.confirmNextPlayer() / session.confirmPlayerSwitch()
# with helper invocations from server/__tests__/_helpers/legacy-confirms.ts.
# Auto-injects the import line near other relative imports.

set -euo pipefail

cd "$(dirname "$0")/.."

FILES=$(grep -rln "session\.confirmNextPlayer\(\)\|session\.confirmPlayerSwitch\(\)" server/__tests__/ shared/ || true)

for f in $FILES; do
  needs_next=false
  needs_switch=false
  if grep -q "session\.confirmNextPlayer()" "$f"; then needs_next=true; fi
  if grep -q "session\.confirmPlayerSwitch()" "$f"; then needs_switch=true; fi

  # Build the helper-import names list.
  imports=""
  if $needs_next; then imports="confirmNextPlayer"; fi
  if $needs_switch; then
    if [[ -n "$imports" ]]; then imports="$imports, confirmPlayerSwitch"
    else imports="confirmPlayerSwitch"; fi
  fi

  # Compute relative path: from $f back to server/__tests__/_helpers/legacy-confirms
  # All target files are either in server/__tests__/*.test.ts (depth 2) or
  # shared/**/*.test.ts (depth 3+). We need the path relative to $(dirname $f).
  dir=$(dirname "$f")
  rel=$(realpath --relative-to="$dir" "server/__tests__/_helpers/legacy-confirms.ts")
  rel="${rel%.ts}"
  # Ensure leading ./
  case "$rel" in
    .*) ;;
    *) rel="./$rel" ;;
  esac

  import_line="import { $imports } from '$rel'"

  # Skip if helper already imported.
  if grep -q "_helpers/legacy-confirms" "$f"; then
    echo "skip-import (already imported): $f"
  else
    # Insert after the last `import { ... } from '...'` line.
    awk -v line="$import_line" '
      BEGIN { last_import = 0 }
      /^import .* from / { last_import = NR }
      { lines[NR] = $0 }
      END {
        for (i = 1; i <= NR; i++) {
          print lines[i]
          if (i == last_import) print line
        }
      }
    ' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
  fi

  # Replace call sites.
  sed -i 's/session\.confirmNextPlayer()/confirmNextPlayer(session)/g; s/session\.confirmPlayerSwitch()/confirmPlayerSwitch(session)/g' "$f"

  echo "patched: $f"
done

echo ""
echo "Codemod complete. Files patched:"
echo "$FILES" | wc -l

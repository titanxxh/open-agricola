#!/usr/bin/env bash
# Codemod: rewrite mechanically-1:1 PendingAction.type assertions into
# InteractionRequest.kind form. Only handles the confirm/feed paths
# (118 callsites); leaves `pending.type === 'choice'` (214) and
# `'cardDraft'` for later codemod (1:N mappings).

set -euo pipefail

cd "$(dirname "$0")/.."

# Grep target list (exclude the helper file we just added).
FILES=$(grep -rln "pending\.type\s*===\s*'confirmNextPlayer'\|pending\.type\s*===\s*'confirmPlayerSwitch'\|pending\.type\s*===\s*'harvestFeed'\|pending\.type\s*!==\s*'confirmNextPlayer'\|pending\.type\s*!==\s*'confirmPlayerSwitch'\|pending\.type\s*!==\s*'harvestFeed'" server/__tests__/ shared/ tests/ 2>/dev/null || true)

count=0
for f in $FILES; do
  # Skip the legacy-confirms helper file
  if [[ "$f" == *legacy-confirms.ts ]]; then continue; fi

  # Use perl for atomic replacements. Capture group $1 is the receiver
  # expression (typically `resp`, `resp2`, `cancelResult`, etc).
  # Pattern matches  <receiver>.pending.type === 'X'
  #              ->  <receiver>.interaction.stateId === 'wait' && <receiver>.interaction.request.kind === 'X'
  perl -i -pe '
    s/(\w+)\.pending\.type === '\''confirmPlayerSwitch'\''/$1.interaction.stateId === '\''wait'\'' \&\& $1.interaction.request.kind === '\''confirm-player-switch'\''/g;
    s/(\w+)\.pending\.type !== '\''confirmPlayerSwitch'\''/!($1.interaction.stateId === '\''wait'\'' \&\& $1.interaction.request.kind === '\''confirm-player-switch'\'')/g;
    s/(\w+)\.pending\.type === '\''confirmNextPlayer'\''/$1.interaction.stateId === '\''wait'\'' \&\& $1.interaction.request.kind === '\''confirm-next-player'\''/g;
    s/(\w+)\.pending\.type !== '\''confirmNextPlayer'\''/!($1.interaction.stateId === '\''wait'\'' \&\& $1.interaction.request.kind === '\''confirm-next-player'\'')/g;
    s/(\w+)\.pending\.type === '\''harvestFeed'\''/$1.interaction.stateId === '\''wait'\'' \&\& $1.interaction.request.kind === '\''feed'\''/g;
    s/(\w+)\.pending\.type !== '\''harvestFeed'\''/!($1.interaction.stateId === '\''wait'\'' \&\& $1.interaction.request.kind === '\''feed'\'')/g;
  ' "$f"
  count=$((count + 1))
  echo "patched: $f"
done

echo ""
echo "Codemod complete. Files patched: $count"

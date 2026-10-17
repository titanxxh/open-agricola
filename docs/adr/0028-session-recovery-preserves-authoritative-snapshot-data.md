# Session recovery preserves authoritative snapshot data

- Status: Accepted
- Date: 2026-10-17
- Issues: #1258, #1270

Ordinary undo currently restores a captured state through the same normalizer used to bootstrap loaded inputs. That path treats a legitimate empty hand as an undealt hand and materializes default representations that were absent from the captured state. A real Grocer purchase followed by a later action and undo receives seven new occupations; Forest Tallyman undo also changes `playedCards` and `blockedBy` representations.

The maintainer chose exact authoritative snapshot restoration over repairing the empty-hand branch alone. New-game creation owns initial dealing. Loading or restoring an existing game must preserve present empty arrays, missing optional fields and existing card identities; it must not deal cards, derive a different `playedCards` representation or add and remove optional rule fields. Required invalid input is rejected at its input boundary instead of being repaired by a new deal. No legacy-save migration is required.

Separate pure data capture from Session-owned rule-definition rehydration. The current Session rebuilds executable definitions and engine cursors using its own registry, including known dynamic spaces and card-held worker locations. Rehydration may attach executable rules; it must not replace captured resources, hands, assignment counts, occupancy, pending data or history. Ordinary undo, command checkpoints, provisional checkpoints and process recovery must share this preservation contract without acquiring bootstrap side effects.

Existing public-event cancellation/archive behavior, current player display-name projection, Protected Observation boundaries and durable provisional failure memory remain governed by their existing contracts. Exact preservation applies to the authoritative data appropriate to that recovery point, rather than requiring undo to erase its cancellation archive or a player's later chosen display name.

Session acceptance uses real card purchases and subsequent public commands. It covers naturally exhausted occupation and minor hands, nonempty controls, normal new-game dealing, Forest Tallyman dynamic-space undo, Step and Action undo, JSON/private-cursor recovery and legal retry. Expected snapshots use pure observation capture; default-field changes and unexpected hand additions must fail rather than be normalized away. After these regressions pass, replace case-specific #1258 representation allowances with the exact restored expectations.

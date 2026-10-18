# 28. Session recovery preserves authoritative snapshot data

- Status: Accepted
- Date: 2026-10-17

## Context

Issues #1258 and #1270. Ordinary undo restored a captured state through the normalizer used to bootstrap loaded inputs, which treated a legitimately empty hand as undealt and materialized default representations absent from the capture. Undoing after a later action could deal seven new occupations or change `playedCards` and `blockedBy` representations.

## Decision

- New-game creation owns initial dealing. Loading or restoring an existing game preserves present empty arrays, missing optional fields and existing card identities; it never deals cards, derives a different representation or adds or removes optional rule fields.
- Required invalid input is rejected at its input boundary instead of being repaired by a new deal.
- Pure data capture is separate from Session-owned rule-definition rehydration. The Session rebuilds executable definitions and engine cursors from its own registry, including known dynamic spaces and card-held worker locations, and never replaces captured resources, hands, assignments, occupancy, pending data or history.
- Ordinary undo, command checkpoints, provisional checkpoints and process recovery share this preservation contract without bootstrap side effects.
- Public-event cancellation and archive behavior, display-name projection, Protected Observation boundaries and durable failure memory keep their own contracts. Exact preservation covers the authoritative data of that recovery point; undo does not erase its cancellation archive or a player's later display name.

## Consequences

- A restored Session equals its captured data; tests compare against pure observation capture, so unexpected hand additions or default fields fail instead of being normalized away.
- No migration for older saves is provided.

## Alternatives considered

- Fixing only the empty-hand branch: other bootstrap side effects would remain on every recovery path.

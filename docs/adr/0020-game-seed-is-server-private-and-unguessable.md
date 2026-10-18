# 20. Game Seed is server-private and unguessable

- Status: Accepted
- Date: 2026-10-04

## Context

Issue #946. Every seat's sync payload carried `gameSeed` and the complete 14-round `roundActionOrder`, and starting hands, draft pools and round cards are deterministic functions of the seed and public settings. Withholding the seed alone was not enough: `createSeed()` drew from 10^9 values with a 32-bit generator, and a player's own hand is its output, so one core could scan every seed in about 21.6 hours while a Room can resume for seven days. Any client could also choose a seed through `newGame`. A card such as Final Scenario can reveal the round-14 card early.

## Decision

- Game Seed never enters a viewer projection of an active game, for any seat or spectator, including the final Frame. Full-state sync (hotseat, dev-room debug) and the all-open perspective of a completed Replay are unchanged.
- An Unrevealed Round Card is `null` in the viewer projection until its round starts, including during draft and Parent Selection. A card revealed by an effect is visible to everyone from its public `action.revealed` event; inferring a card from its stage does not reveal it. The mask also covers goods scheduled on a future round's card. Live sync, Bug Report evidence and the Replay seat perspective share this projection; live sync to a dev room is exempt from the round-card mask only.
- Outside dev rooms the server ignores client-supplied seeds and rejects `loadGame`.
- Without an explicit seed, Game Seed is a random value of at least 128 bits, and every derived random stream comes from a cryptographic generator (HMAC-SHA256 in counter mode from an audited synchronous pure-JavaScript library, because rules also run in a browser Worker). Sub-streams are separated by label.
- An Explicit Seed is a number and keeps the existing generator and results; it serves tests, dev rooms and debug endpoints and protects nothing.
- The ordinary-deck and parent-selection seeds stay independent of Game Seed and are equally wide.
- At rollout every active non-dev Game Context was expired once by a manual operator step; no migration or startup gate is kept.

## Consequences

- `gameSeed` is a number or a wide seed string, stored in Room snapshots and Replay Frames.
- Two generator paths coexist, selected only by whether the seed was explicit.
- `shared/` carries a browser-runnable cryptographic dependency.
- A normal game cannot be reproduced from its seed; evidence relies on Replay Frames (ADR 0011).

## Alternatives considered

- Withholding the seed but keeping the generator: the seed is recoverable from a hand.
- A private seed per hidden item: each is equally enumerable.
- A wide non-cryptographic generator such as xoshiro256: linear, with outputs visible to players.
- Routing numeric seeds through the new generator: hundreds of test files depend on the current results.
- Expiring old games in a migration or by build ID at startup: leaves permanent code for a one-off step.
- Revealing the seed in the final Frame: has no use once client seeds are ignored.

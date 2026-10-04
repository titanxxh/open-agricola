# Game Seed is server-private and unguessable

- Status: Accepted
- Date: 2026-10-04

## Context

Every seat's sync payload carried `gameSeed` in clear, and starting hands, draft pools and the round-card order are deterministic functions of it and of public room settings. The payload also carried the complete 14-round `roundActionOrder`. A participant could therefore recompute or simply read information the rules keep hidden (issue #946).

Withholding the seed is not enough on its own. `createSeed()` draws from 10^9 values and the generator has 32 bits of state, while a player's own starting hand is an output of that generator. Testing one candidate seed with the unoptimised production `dealHands` took 77.6 µs on a developer machine, which puts a full scan at about 21.6 hours on one core, and a Room can be resumed for seven days. Any client could also start a game on a seed of its choosing through `newGame`.

## Decision

1. Game Seed never enters a viewer projection of an active game, for a seat or a spectator, including the final frame. Full-state sync (hotseat, dev-room debug) and the open perspective of a completed Game Replay Archive are unchanged.
2. An Unrevealed Round Card is `null` in the viewer projection until its round starts; none is revealed during the draft or Parent Selection, when the round counter already reads 1. The same mask covers the round card named by goods scheduled on a future round. Live sync, Bug Report evidence and the Replay seat perspective share this one projection. Live sync to a dev room is exempt from the round-card mask only; it still withholds the seed.
3. Outside dev rooms the server ignores a client-supplied seed and rejects `loadGame`, which would otherwise let a client install any state, seed included.
4. When no seed is given, Game Seed is a random value of at least 128 bits and every random stream derived from it comes from a cryptographic generator, supplied by an audited pure-JavaScript synchronous library because the rules also run in a browser Worker. Sub-streams are separated by label rather than by arithmetic on the seed.
5. An Explicit Seed is a number and keeps the existing generator with unchanged results. It serves tests, dev rooms and debug endpoints and protects nothing.
6. The ordinary-deck and parent-selection seeds stay independent of Game Seed and become equally wide.
7. At rollout every active non-dev Game Context is expired once, as a manual operator step before the new backend starts. No migration or startup gate is kept for it.

## Consequences

- `gameSeed` widens from a number to a number or a wide seed string, and that value is stored in Room snapshots and Replay Frames.
- Two generator paths coexist; which one runs depends only on whether the seed was given explicitly.
- `shared/` gains its first cryptographic dependency and must stay browser-runnable.
- A game in a normal Room cannot be reproduced from its seed. Evidence relies on Replay Frames, as ADR-0011 already requires.

## Considered alternatives

- **Withhold the seed and keep the generator.** Rejected: the seed can be recovered from a player's own hand.
- **Give each hidden item its own private seed, as the ordinary deck already has.** Rejected: each such seed is equally enumerable.
- **A wide but non-cryptographic generator such as xoshiro256.** Rejected: it is linear and the cards a player sees are its outputs.
- **Route numeric seeds through the new generator too.** Rejected: 629 test and script files pass numeric seeds and depend on the present results.
- **Expire old games in a migration or by build id at startup.** Rejected in favour of a one-off manual step that leaves no permanent code.
- **Reveal the seed to players in the final frame.** Rejected: with client seeds ignored in normal Rooms it has no use there.

# 36. Consensual termination is distinct from normal completion and expiry

- Status: Accepted
- Date: 2026-10-30
- Revises: ADR 0009, ADR 0010, ADR 0013 and ADR 0014 for consensual termination only

## Context

The current dissolution path lets the creator discard a started Room without other players' consent. Dissolution, idle expiry and unfinished rematches all become `expired` contexts, and normally discard unfinished Replay data. This loses the distinction between an agreed early ending and automatic cleanup.

## Confirmed decisions

- Any seated player may propose ending a started game, including during opening selection or drafting. Confirming the proposal records the proposer's consent. Every other player must explicitly agree before the game ends. A disconnected player still has to agree after reconnecting.
- Standard solo and hotseat games end after one confirmation. Hotseat does not require a separate confirmation for each controlled seat.
- Gameplay continues while a proposal is pending. Any rejection or withdrawal by the proposer cancels that proposal. Elapsed time never implies consent.
- A creator may still cancel a waiting Room directly. Started games cannot bypass agreement through the old WebSocket or HTTP dissolution entry points.
- A rematch that would retire an unfinished game requires the same agreement. Its old `roomId` identifies a terminated game; the new game receives a new identity.
- Termination retains its cause, proposer, consent records, time and round separately from normal completion. Personal history labels it as an agreed termination. It produces no official score and does not count as a normal completion or win/loss result.
- A terminated game's recorded Replay remains public at its original link, including seat and all-open perspectives. Confirmation explains that the Replay and hidden hands become public. Existing identity anonymization and content-erasure policies continue to apply.

## Ownership and durability

Agreement belongs to the Room lifecycle, not the game's rule-based `gameOver` condition. Implementing termination must not synthesize normal completion or insert an unfinished score into the Game Result Archive.

The Room queue orders voting, game commands and terminal transitions. The owner and durable commit boundary persist consent and the terminal archive before publishing success. Reconnection and process recovery restore pending agreement rather than inventing consent. Old proposal responses cannot approve a later proposal, and game undo does not restore or remove consent.

## Offline players

A pending proposal leaves the existing all-disconnected idle expiry unchanged. Expiry remains distinct from agreement and does not imply consent. An agreed rematch carries every original seat into the new Room, including a player who agreed and then disconnected; that Room waits for missing players before starting.

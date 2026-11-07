# 41. Opening draft advances per player

- Status: Accepted
- Date: 2026-11-07
- Implementation: `shared/draft/`, `shared/projections/draft-progress.ts`, and the existing Session, transport, and client seams

A global round barrier waits for every seat before passing any remaining cards. One slow or disconnected player therefore stops every other player after a single choice. Use Asynchronous Draft: a player can continue choosing from cards already received, while unprocessed packets accumulate at the seat that has yet to choose. A disconnected seat remains part of the passing order. All players must finish drafting before gameplay starts.

This replaces the global round barrier with player-specific progress. It requires durable packet ownership and input identities that remain valid when another player submits, while retries must never select from the next packet. The existing backend-authority, private-card projection, and durable command receipt boundaries remain in force. See [ADR 0022](0022-distributed-room-recovery.md).

Show a persistent public view of each player's occupation/minor counts, selection status, and connection status. Selection status distinguishes cards available to choose, waiting for a packet, and personal completion. Connection status is separate: being disconnected does not itself decide whether a seat has cards to choose. Card identities remain private.

Retain the existing waiting-name presentation. Its waiting seats must follow the new selection state: seats with a current packet that requires a choice. A seat waiting to receive a packet is not highlighted as needing to act. The same meaning applies to the draft overlay and lobby summary. Dependency-chain presentation is outside this change.

Selection follows these rules:

- Ordinary draft still selects one occupation and one minor together. Confirmation passes their remaining cards together.
- Each player's received packets are processed in arrival order within each draft stage. Later packets and unopened stages cannot be previewed or selected out of order. The player's own kept-card history remains available.
- Moor draft retains its occupation, Moor minor, and published minor stages. A player who completes one stage can start their next stage while other players are still choosing in an earlier stage. Only overall completion waits for all players.

For example, with passing order A → B → C → D → A and A disconnected before choosing, the other players can reach confirmed-choice counts A=0, B=1, C=2, D=3. A retains the initial packet and three later packets accumulate there. Other seats then wait when they exhaust the packets already available to them. Asynchronous Draft does not let a player bypass A or finish without receiving the required packets.

Preserve existing rules around the requested change: a disconnected seat is neither skipped nor given discretionary automatic choices, confirmed selections cannot be withdrawn, and a forced final card is kept automatically. Reconnecting or recovering a Room resumes the same current packet, queued packets, selections, and personal stage.

Shared-device play retains seat-by-seat handoff and explicit private-view confirmation. After one manual selection, the device moves forward in seat order to the next seat with a packet requiring a choice. Seats waiting for packets or already finished are skipped; forced automatic choices do not require another handoff. Independent devices can continue choosing whenever their next packet is available.

## Upgrade boundary

The retained-game [upgrade policy](../HOW_TO_DEPLOY.md#compatibility-of-retained-games) applies to this format change. `shared/draft/legacy-draft.ts` converts global-round snapshots at Session recovery and saved-state projection boundaries. It partitions kept cards across stages, retains unsubmitted current packets, passes already confirmed remainders to the next seat and preserves unopened stage deals. Conversion neither selects cards nor records new picks. Current-format states pass through unchanged; inconsistent legacy data is rejected instead of re-dealt.

Migrated games retain their original frozen Viewer. Their new Replay Frames include the read-only global-round fields that Viewer reads, while live projections expose only the current format and redact every private alias. Previously recorded Frames and hashes stay unchanged. Coverage: `server/__tests__/legacy-draft-recovery-session.test.ts`, `server/game/__tests__/room-committer.test.ts`, and `e2e-tests/legacy-draft-recovery.spec.ts`; fixtures record the pre-change writer revision.

Source anchors: `shared/draft/draft-manager.ts`, `shared/session/phases/draft.ts`, `server/game/command-input.ts`, and `client/app/draft/DraftOverlay.tsx`. Existing coverage starts at `shared/draft/__tests__/draft-manager.test.ts`, `server/game/__tests__/draft-session.test.ts`, and `e2e-tests/draft-opening-order.spec.ts`.

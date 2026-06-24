/**
 * Draft-phase mixin extracted from GameCore (S2 Task 12).
 *
 * Hosts the per-player draft pick submission entry. Round-advance /
 * finalize internals stay inside `shared/draft/draft-manager.ts`; this
 * module orchestrates those calls from the GameCore side via `@internal`
 * accessors. The S2 Task 13.6 PendingAction-removal pass (2026-05-05)
 * deleted the legacy `computeCardDraftPending` helper — clients now read
 * draft state directly off `GameState.draft` (DraftOverlay does this
 * already).
 */

import type { DraftPickPayload } from '../../draft/types.ts'
import { processSubmit, tryAdvanceRound } from '../../draft/draft-manager.ts'
import { recordDraftPick } from '../../session/stats.ts'
import type { GameCore, SessionResponse } from '../session-core.ts'
import type { PrivateGameEvent } from '../../contract/protocol/game.ts'

/**
 * Submit a single player's pick for the current draft round. Validates
 * draft phase, calls processSubmit/tryAdvanceRound from
 * `shared/draft/draft-manager.ts`, records draft picks for stats, and
 * triggers `finalizeDraft` once every round has completed.
 *
 * Migrated from GameCore.submitDraftPick (S2 Task 12 part 2).
 */
export const submitDraftPick = (
  core: GameCore,
  playerId: string,
  pick: DraftPickPayload,
): SessionResponse => {
  if (core.state.phase !== 'draft' || !core.state.draft) {
    return core.emitResponse(false, 'not in draft phase')
  }
  const sub = processSubmit(core.state.draft, playerId, pick)
  if (sub.error) {
    return core.emitResponse(false, sub.error)
  }
  const submittedRound = sub.draft.round
  const totalRounds = sub.draft.totalRounds
  core.setDraftState(sub.draft)
  const player = core.state.players.find((p) => p.id === playerId)
  if (player && core.state.draft) {
    const draftTurn = core.state.draft.round
    if (pick.occCardId) recordDraftPick(player, pick.occCardId, draftTurn)
    if (pick.minorCardId) recordDraftPick(player, pick.minorCardId, draftTurn)
  }
  if (!core.state.draft) return core.emitResponse()
  const advance = tryAdvanceRound(core.state.draft)
  core.setDraftState(advance.draft)
  const draftAfterAdvance = core.state.draft
  const playerPool = draftAfterAdvance.pools[playerId]
  const playerKept = draftAfterAdvance.kept[playerId]
  const privateEvents: PrivateGameEvent[] = [
    {
      schemaVersion: 1,
      type: 'private.draftUpdated',
      recipientPlayerId: playerId,
      round: submittedRound,
      totalRounds,
      picked: pick,
      poolCounts: {
        occ: playerPool?.occ.length ?? 0,
        minor: playerPool?.minor.length ?? 0,
      },
      keptCounts: {
        occ: playerKept?.occ.length ?? 0,
        minor: playerKept?.minor.length ?? 0,
      },
      advanced: advance.advanced,
      finished: advance.finished,
    },
  ]
  if (advance.finished) {
    core.applyDraftFinalize()
    for (const p of core.state.players) {
      privateEvents.push({
        schemaVersion: 1,
        type: 'private.handChanged',
        recipientPlayerId: p.id,
        cardIds: [...p.occupationHand, ...p.minorHand],
        cardType: 'mixed',
        reason: 'draft-finalized',
      })
    }
  }
  return core.emitResponse(true, undefined, privateEvents)
}

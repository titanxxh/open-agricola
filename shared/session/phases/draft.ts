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
import { recordDraftPick } from '../../logic/stats.ts'
import type { GameCore, SessionResponse } from '../session-core.ts'

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
  core.setDraftState(sub.draft)
  const player = core.state.players.find((p) => p.id === playerId)
  if (player && core.state.draft) {
    const draftTurn = core.state.draft.round
    recordDraftPick(player, pick.occCardId, draftTurn)
    recordDraftPick(player, pick.minorCardId, draftTurn)
  }
  if (!core.state.draft) return core.emitResponse()
  const advance = tryAdvanceRound(core.state.draft)
  core.setDraftState(advance.draft)
  if (advance.finished) {
    core.applyDraftFinalize()
  }
  return core.emitResponse()
}

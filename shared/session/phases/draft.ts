/**
 * Draft-phase mixin extracted from GameCore (S2 Task 12).
 *
 * Hosts the card-draft pending derivation and the per-player draft
 * pick submission entry. Round-advance / finalize internals stay
 * inside `shared/draft/draft-manager.ts`; this module orchestrates
 * those calls from the GameCore side via `@internal` accessors.
 *
 * Wrapping `card-draft` kind into a real InteractionRequest
 * (S2 plan §3.7) is still deferred — current path keeps the
 * PendingAction surface as a transitional shim.
 */

import type { GameState, PendingAction } from '../../game/types.ts'
import type { DraftPickPayload } from '../../draft/types.ts'
import { processSubmit, tryAdvanceRound } from '../../draft/draft-manager.ts'
import { recordDraftPick } from '../../logic/stats.ts'
import type { GameCore, SessionResponse } from '../session-core.ts'

/**
 * Derive the legacy `PendingAction` shape for the draft phase. Returns
 * null when the session isn't currently drafting; otherwise reports the
 * round, totalRounds, and whether every seat has submitted both picks.
 */
export const computeCardDraftPending = (
  state: GameState,
): Extract<PendingAction, { type: 'cardDraft' }> | null => {
  if (state.phase !== 'draft' || !state.draft) return null
  const draft = state.draft
  const allSubmitted = draft.seatOrder.every(
    (pid) =>
      draft.pendingPicks[pid] != null &&
      draft.pendingPicks[pid].occ !== null &&
      draft.pendingPicks[pid].minor !== null,
  )
  return {
    type: 'cardDraft',
    round: draft.round,
    totalRounds: draft.totalRounds,
    allSubmitted,
  }
}

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

/**
 * Draft-phase pure helpers extracted from GameCore (S2 Task 12).
 *
 * Owns the card-draft pending derivation. The draft submission /
 * round-advance / finalize entry points still live in GameCore because
 * they wrap `processSubmit` / `tryAdvanceRound` / `finalizeDraft` from
 * `shared/draft/draft-manager.ts` with engineStack and history side
 * effects. Wrapping `card-draft` kind into a real InteractionRequest
 * (S2 plan §3.7) is deferred — current path keeps PendingAction
 * surface as a transitional shim.
 */

import type { GameState, PendingAction } from '../../game/types.ts'

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

import type { GameState } from '../../shared/contract/types'
import type { DraftState } from '../../shared/draft/types'
import { draftSeatProgress } from '../../shared/projections/draft-progress'

/**
 * Hotseat helpers for the two setup phases where every seat submits
 * independently instead of taking turns: card draft and parent selection.
 *
 * Neither phase advances `state.currentPlayerIndex`, so the panel cannot follow
 * "whose turn it is" the way it does during a round. Instead the device walks
 * the seats in order and stops at the next seat with an available choice.
 */
export const nextHotseatDraftSeatId = (draft: DraftState): string | null => {
  const start = draft.lastManualPickerId ? draft.seatOrder.indexOf(draft.lastManualPickerId) + 1 : 0
  for (let offset = 0; offset < draft.seatOrder.length; offset++) {
    const seatId = draft.seatOrder[(start + offset) % draft.seatOrder.length]
    if (draftSeatProgress(draft, seatId).kind === 'selecting') return seatId
  }
  return null
}

export const nextHotseatParentSeatId = (state: GameState): string | null => {
  const selection = state.parentSelection
  if (!selection) return null
  for (const player of state.players) {
    if (!selection.submissions[player.id]) return player.id
  }
  return null
}

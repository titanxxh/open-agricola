import type { GameState } from '../../shared/contract/types'
import type { DraftState } from '../../shared/draft/types'
import { computeDraftViewModel } from './draft/DraftOverlay'

/**
 * Hotseat helpers for the two setup phases where every seat submits
 * independently instead of taking turns: card draft and parent selection.
 *
 * Neither phase advances `state.currentPlayerIndex`, so the panel cannot follow
 * "whose turn it is" the way it does during a round. Instead the device walks
 * the seats in order and stops at the first one that has not submitted yet.
 */
export const nextHotseatDraftSeatId = (draft: DraftState): string | null => {
  for (const seatId of draft.seatOrder) {
    if (!computeDraftViewModel(draft, seatId).alreadySubmitted) return seatId
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

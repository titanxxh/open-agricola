import type { ActionFlow, PlayerState } from '../contract/types'
import type { CardListenerRegistration } from '../cards/card-listeners'

export type MatchedTrigger = {
  listener: CardListenerRegistration
  cardId: string
  ownerPlayerId: string
  flow: ActionFlow
  interactivity: 'auto' | 'interactive'
  playOrderIndex: number
}

export function getPlayOrderIndex(player: PlayerState, cardId: string): number {
  const occIdx = (player.occupationPlayed ?? []).indexOf(cardId)
  if (occIdx >= 0) return occIdx
  const occLen = (player.occupationPlayed ?? []).length
  const minorIdx = (player.minorPlayed ?? []).indexOf(cardId)
  if (minorIdx >= 0) return occLen + minorIdx
  const impIdx = (player.improvements ?? []).indexOf(cardId)
  if (impIdx >= 0) return 1000 + impIdx
  return Number.MAX_SAFE_INTEGER
}

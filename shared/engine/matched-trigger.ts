import type { ActionFlow, GameState, PlayerState } from '../contract/types'
import type { CardListenerRegistration, MatchedCardListener } from '../cards/card-listeners'
import { findPlayerById, findPlayerIndexById } from '../domain/player'

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

export function planListenerOwnerGroups(
  matched: MatchedCardListener[],
  state: GameState,
  triggerPlayerId: string | undefined,
): { ownerPlayerId: string | undefined; listeners: MatchedCardListener[] }[] {
  const ordered = matched.map((listener, index) => {
    const owner = findPlayerById(state, listener.ownerPlayerId)
    const ownerOrder = !listener.ownerPlayerId ? -1 : listener.ownerPlayerId === triggerPlayerId ? 0
      : owner ? findPlayerIndexById(state, owner.id) + 1 : Number.MAX_SAFE_INTEGER
    const playOrder = owner ? getPlayOrderIndex(owner, listener.cardId) : Number.MAX_SAFE_INTEGER
    return { listener, ownerOrder, playOrder, index }
  }).sort((a, b) => a.ownerOrder - b.ownerOrder || a.playOrder - b.playOrder || a.index - b.index)
  const groups: { ownerPlayerId: string | undefined; listeners: MatchedCardListener[] }[] = []
  for (const { listener } of ordered) {
    const ownerPlayerId = listener.ownerPlayerId || triggerPlayerId
    const last = groups.at(-1)
    if (last && last.ownerPlayerId === ownerPlayerId) last.listeners.push(listener)
    else groups.push({ ownerPlayerId, listeners: [listener] })
  }
  return groups
}

import type { PlayerState } from '../../game/types'

export const initCardState = (player: PlayerState, cardId: string) => {
  if (!player.cardStates) player.cardStates = {}
  if (!player.cardStates[cardId]) player.cardStates[cardId] = { counters: {} }
  if (!player.cardStates[cardId].counters) player.cardStates[cardId].counters = {}
  return player.cardStates[cardId].counters!
}

export const incCounter = (player: PlayerState, cardId: string, key: string, delta = 1) => {
  const counters = initCardState(player, cardId)
  counters[key] = (counters[key] ?? 0) + delta
}

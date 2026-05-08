import type { Resource, PlayerState } from '../../contract/types'
import { initCardState } from '../__stubs__/helpers'

export const setStoredResource = (
  player: PlayerState,
  cardId: string,
  resource: keyof Resource,
  amount: number,
) => {
  const counters = initCardState(player, cardId)
  counters[resource] = Math.max(0, amount)
}

export const getStoredResource = (
  player: PlayerState,
  cardId: string,
  resource: keyof Resource,
) => player.cardStates?.[cardId]?.counters?.[resource] ?? 0

export const takeStoredResource = (
  player: PlayerState,
  cardId: string,
  resource: keyof Resource,
  amount = getStoredResource(player, cardId, resource),
) => {
  const stored = getStoredResource(player, cardId, resource)
  const taken = Math.max(0, Math.min(stored, amount))
  if (taken <= 0) return 0
  const counters = initCardState(player, cardId)
  counters[resource] = stored - taken
  return taken
}

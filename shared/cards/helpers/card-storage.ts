import { payLeaf } from './pay-gain-node'
import type { ActionFlow, CardProvidedPaymentResourceProvider, Resource, PlayerState } from '../../contract/types'
import { initCardState } from './card-state'

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

/** Spend only this card's goods, with the same live-backing checks as other payments. */
export const payStoredResourceLeaf = (
  player: PlayerState, cardId: string, resource: keyof Resource, amount: number,
): ActionFlow => {
  const key: CardProvidedPaymentResourceProvider['key'] = `${cardId}:${resource}`
  return payLeaf({ cardId, cost: {
    fee: { [resource]: amount },
    paymentBudget: { [resource]: 0, [key]: getStoredResource(player, cardId, resource) },
    paymentResourceProviders: [{ key, sourceCard: cardId, available: getStoredResource(player, cardId, resource),
      covers: [{ resource, costAmount: 1, paymentAmount: 1 }], consume: { type: 'card', playerId: player.id, cardId, resource },
    }],
  } })
}

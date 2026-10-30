import type { ActionDefinition, GameState, PlayerState, Resource } from '../../contract/types'
import type { EventSink } from '../../contract/events'
import { getCardEffect } from '../../cards/card-effects'

export const DISCARDABLE_SUPPLY_GOODS = ['wood', 'clay', 'reed', 'stone', 'grain', 'vegetable', 'food'] as const
export type DiscardableSupplyGood = typeof DISCARDABLE_SUPPLY_GOODS[number]

const isDiscardableSupplyGood = (key: string): key is DiscardableSupplyGood =>
  (DISCARDABLE_SUPPLY_GOODS as readonly string[]).includes(key)

const playedCardIds = (player: PlayerState): string[] => [
  ...player.improvements,
  ...player.minorPlayed,
  ...player.occupationPlayed,
]

const positiveCounts = (counts: Partial<Resource>): Partial<Resource> => {
  const resources: Partial<Resource> = {}
  for (const key of DISCARDABLE_SUPPLY_GOODS) {
    const amount = counts[key] ?? 0
    if (amount > 0) resources[key] = amount
  }
  return resources
}

export function voluntaryDiscardAvailability(state: GameState, player: PlayerState): Partial<Resource> {
  const blocked = new Set<keyof Resource>()
  const committed: Partial<Resource> = {}
  for (const owner of state.players) {
    for (const cardId of playedCardIds(owner)) {
      const effect = getCardEffect(cardId)
      if (!effect) continue
      if (owner.id === player.id) {
        for (const key of effect.blockedVoluntaryDiscardResources?.(state, player) ?? []) blocked.add(key)
      }
      for (const commitment of effect.computeResourceCommitments?.(state, owner) ?? []) {
        if (commitment.playerId !== player.id) continue
        for (const [key, amount] of Object.entries(commitment.resources)) {
          if (typeof amount !== 'number' || amount <= 0) continue
          const resource = key as keyof Resource
          committed[resource] = (committed[resource] ?? 0) + amount
        }
      }
    }
  }
  const available: Partial<Resource> = {}
  for (const key of DISCARDABLE_SUPPLY_GOODS) {
    if (blocked.has(key)) continue
    const count = Math.max(0, (player.resources[key] ?? 0) - (committed[key] ?? 0))
    if (count > 0) available[key] = count
  }
  return available
}

const readCounts = (raw: unknown): Partial<Resource> | undefined => {
  if (!raw || typeof raw !== 'object') return undefined
  const counts: Partial<Resource> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return undefined
    if (!isDiscardableSupplyGood(key)) {
      if (value !== 0) return undefined
      continue
    }
    counts[key] = value
  }
  return counts
}

const discardSupplyGoods = (
  state: GameState,
  player: PlayerState,
  raw: unknown,
  eventSink: EventSink | undefined,
) => {
  const counts = readCounts(raw)
  const available = voluntaryDiscardAvailability(state, player)
  if (!counts) return { type: 'fail' as const, errorKey: 'log.discardGoodsFail', recoverable: true }
  const resources = positiveCounts(counts)
  if (Object.keys(resources).length === 0) {
    return { type: 'fail' as const, errorKey: 'log.discardGoodsFail', recoverable: true }
  }
  for (const key of DISCARDABLE_SUPPLY_GOODS) {
    if ((resources[key] ?? 0) > (available[key] ?? 0)) {
      return { type: 'fail' as const, errorKey: 'log.discardGoodsFail', recoverable: true }
    }
  }
  for (const key of DISCARDABLE_SUPPLY_GOODS) {
    const amount = resources[key] ?? 0
    if (amount > 0) player.resources[key] -= amount
  }
  eventSink?.emit<'resource.moved'>({
    type: 'resource.moved',
    resources,
    from: { kind: 'player', playerId: player.id },
    to: { kind: 'supply' },
    reason: 'discard',
  })
  return { type: 'ok' as const }
}

export const discardGoodsAction: ActionDefinition = {
  id: 'discard-goods',
  nameKey: 'actions.discard-goods.name',
  descriptionKey: 'actions.discard-goods.description',
  roundAvailable: 1,
  gainPerRound: {},
  anytime: true,
  canBeExecutedByPlayer: (state, player) => Object.keys(voluntaryDiscardAvailability(state, player)).length > 0,
  execute: ({ state, player }) => {
    const availableByResource = voluntaryDiscardAvailability(state, player)
    if (Object.keys(availableByResource).length === 0) {
      return { type: 'fail', errorKey: 'log.discardGoodsFail' }
    }
    return {
      type: 'request',
      request: {
        kind: 'resource-quantity-select',
        cardId: 'discard-goods',
        availableByResource,
        promptKey: 'ui.interactionDiscardGoods',
        requireAtLeastOne: true,
        anytimeWindow: { allowed: false },
      },
      promptKey: 'ui.interactionDiscardGoods',
    }
  },
  resolveChoice: ({ state, player, eventSink }, _choice, payload) =>
    discardSupplyGoods(state, player, payload?.resourceCounts ?? payload, eventSink),
}

import type { ActionDefinition, Resource } from '../../../contract/types'
import { REAL_RESOURCE_KEYS } from '../../../contract/resource-keys'
import { initCardState } from '../../../cards/__stubs__/helpers'

const positiveResources = (
  params: Record<string, unknown> | undefined,
): Partial<Resource> => {
  const resources: Partial<Resource> = {}
  REAL_RESOURCE_KEYS.forEach((key) => {
    const amount = params?.[key]
    if (typeof amount === 'number' && amount > 0) resources[key] = amount
  })
  return resources
}

const canTakeFromCard = (
  counters: Record<string, number> | undefined,
  cost: Partial<Resource>,
) =>
  Object.entries(cost).every(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return true
    return (counters?.[key] ?? 0) >= value
  })

export const takeFromCardAction: ActionDefinition = {
  id: 'take-from-card',
  nameKey: 'actions.take-from-card.name',
  descriptionKey: 'actions.take-from-card.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params, sourceCard, eventSink }) => {
    if (!sourceCard) {
      return { type: 'fail', errorKey: 'log.exchangeFail' }
    }
    const gain = positiveResources(params)
    if (Object.keys(gain).length === 0) {
      return { type: 'ok', resourcesGained: {} }
    }
    const counters = player.cardStates?.[sourceCard]?.counters
    if (!canTakeFromCard(counters, gain)) {
      return { type: 'fail', errorKey: 'log.exchangeFail' }
    }

    const cardCounters = initCardState(player, sourceCard)
    Object.entries(gain).forEach(([key, value]) => {
      if (typeof value !== 'number' || value <= 0) return
      cardCounters[key] = Math.max(0, (cardCounters[key] ?? 0) - value)
    })
    eventSink?.emit<'card.stackChanged'>({
      type: 'card.stackChanged',
      cardId: sourceCard,
      targetPlayerId: player.id,
      resources: gain,
      delta: -Object.values(gain).reduce<number>(
        (sum, value) => sum + (typeof value === 'number' && value > 0 ? value : 0),
        0,
      ),
      reason: 'take',
    })
    return {
      type: 'flow',
      flow: {
        type: 'leaf',
        actionId: 'gain',
        sourceCard,
        params: gain,
        actionContext: { checkedReplaceAction: true },
      },
    }
  },
}

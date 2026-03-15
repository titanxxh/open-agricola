import type { ActionDefinition, Resource } from '../../game/types'
import { initCardState } from '../../cards/__stubs__/helpers'
import { gainResources } from './gain'

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
  execute: ({ player, params, sourceCard }) => {
    if (!sourceCard) {
      return { type: 'fail', logKey: 'log.exchangeFail' }
    }
    const gain = params ?? {}
    const counters = player.cardStates?.[sourceCard]?.counters
    if (!canTakeFromCard(counters, gain as Partial<Resource>)) {
      return { type: 'fail', logKey: 'log.exchangeFail' }
    }

    const cardCounters = initCardState(player, sourceCard)
    Object.entries(gain).forEach(([key, value]) => {
      if (typeof value !== 'number' || value <= 0) return
      cardCounters[key] = Math.max(0, (cardCounters[key] ?? 0) - value)
    })
    gainResources(player, gain)

    return {
      type: 'ok',
      resourcesGained: gain,
      logKey: 'log.cardEffectGain',
      logParams: { gain, cardId: sourceCard },
    }
  },
}

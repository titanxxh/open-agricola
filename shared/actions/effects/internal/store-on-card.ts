import type { ActionDefinition, Resource } from '../../../contract/types'
import { initCardState } from '../../../cards/__stubs__/helpers'

export const storeOnCardAction: ActionDefinition = {
  id: 'store-on-card',
  nameKey: 'actions.store-on-card.name',
  descriptionKey: 'actions.store-on-card.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params, sourceCard }) => {
    if (!sourceCard) {
      return { type: 'fail', errorKey: 'log.exchangeFail' }
    }
    const counters = initCardState(player, sourceCard)
    const stored: Partial<Resource> = {}
    Object.entries(params ?? {}).forEach(([key, value]) => {
      if (typeof value !== 'number' || value <= 0) return
      const resourceKey = key as keyof Resource
      counters[resourceKey] = (counters[resourceKey] ?? 0) + value
      stored[resourceKey] = value
    })
    return { type: 'ok', extraData: { stored } }
  },
}

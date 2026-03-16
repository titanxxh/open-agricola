import type { ActionDefinition, Resource } from '../../game/types'
import { canPayResources, payResources } from './pay'

export const payResourcesAction: ActionDefinition = {
  id: 'pay-resources',
  nameKey: 'actions.pay-resources.name',
  descriptionKey: 'actions.pay-resources.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  costPreview: {
    getBaseCost: ({ params }) => params ?? {},
  },
  execute: ({ player, params }) => {
    const cost = params ?? {}
    if (!canPayResources(player, cost as Partial<Resource>)) {
      return { type: 'fail', logKey: 'log.exchangeFail' }
    }
    payResources(player, cost)
    return { type: 'ok' }
  },
}

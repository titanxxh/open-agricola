import type { ActionDefinition, Resource } from '../../game/types'
import { addCardResourcePaid } from '../../cards/helpers/card-state'
import { canPayResources, payResources } from '../helpers/payment'

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
  execute: ({ player, params, sourceCard }) => {
    const cost = params ?? {}
    if (!canPayResources(player, cost as Partial<Resource>)) {
      return { type: 'fail', logKey: 'log.exchangeFail' }
    }
    payResources(player, cost)
    if (sourceCard) {
      addCardResourcePaid(player, sourceCard, cost as Partial<Resource>)
    }
    if (sourceCard) {
      return {
        type: 'ok',
        resourcesPaid: cost as Partial<Resource>,
        logKey: 'log.cardEffectPay',
        logParams: { cost: cost as Partial<Resource>, cardId: sourceCard },
      }
    }
    return { type: 'ok', resourcesPaid: cost as Partial<Resource> }
  },
}

import type {
  ActionDefinition,
  ComplexCost,
  Resource,
} from '../../game/types'
import { addCardResourcePaid } from '../../cards/helpers/card-state'
import {
  canPayResources,
  isComplexCost,
  payResources,
} from '../helpers/payment'

export type PayParams = {
  cost: Partial<Resource> | ComplexCost
  costType?: string
  optionPrefix?: string
  paymentChoice?: string
  includeReturnedCard?: boolean
}

export const payAction: ActionDefinition = {
  id: 'pay',
  nameKey: 'actions.pay.name',
  descriptionKey: 'actions.pay.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  costPreview: {
    getBaseCost: ({ params }) => {
      const p = params as PayParams | undefined
      if (!p?.cost) return {}
      if (isComplexCost(p.cost)) return p.cost.fee ?? {}
      return p.cost
    },
  },
  execute: ({ player, params, sourceCard }) => {
    const p = params as PayParams | undefined
    if (!p?.cost) return { type: 'fail', logKey: 'log.payFail' }
    if (isComplexCost(p.cost)) {
      // ComplexCost branches handled in Task 1.5/1.6.
      return { type: 'fail', logKey: 'log.payFail' }
    }
    const flat = p.cost as Partial<Resource>
    if (!canPayResources(player, flat)) {
      return { type: 'fail', logKey: 'log.payFail' }
    }
    payResources(player, flat)
    if (sourceCard) {
      addCardResourcePaid(player, sourceCard, flat)
      return {
        type: 'ok',
        resourcesPaid: flat,
        logKey: 'log.cardEffectPay',
        logParams: { cost: flat, cardId: sourceCard },
      }
    }
    return { type: 'ok', resourcesPaid: flat }
  },
}

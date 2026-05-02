import type {
  ActionDefinition,
  ActionExecutionResult,
  ComplexCost,
  CostModifierType,
  PaymentSolution,
  Resource,
} from '../../game/types'
import { addCardResourcePaid } from '../../cards/helpers/card-state'
import {
  canPayResources,
  executePaymentSolution,
  isComplexCost,
  payResources,
} from '../helpers/payment'
import { resolveCostPaymentSelection } from '../helpers/pay-helpers'

export type PayParams = {
  cost: Partial<Resource> | ComplexCost
  costType?: CostModifierType
  optionPrefix?: string
  paymentChoice?: string
  includeReturnedCard?: boolean
}

const buildSelectedResult = (
  solution: PaymentSolution,
  sourceCard: string | undefined,
  costType: CostModifierType | undefined,
  player: import('../../game/types').PlayerState,
  state: import('../../game/types').GameState,
): ActionExecutionResult => {
  executePaymentSolution(player, solution, { costType, state })
  const resourcesPaid = solution.resourcesPaid
  if (sourceCard) {
    addCardResourcePaid(player, sourceCard, resourcesPaid)
  }
  const extraData: Record<string, unknown> = {
    resourcesPaid,
    bonusUsed: solution.bonusUsed
      ? solution.bonusUsed.split(',').map((s) => s.trim()).filter(Boolean)
      : [],
  }
  if (solution.bonusChoiceIndex) {
    extraData.bonusChoiceIndex = solution.bonusChoiceIndex
  }
  if (solution.cardUsed) {
    extraData.returnedCardId = solution.cardUsed
  }
  if (solution.feeIndex !== undefined) {
    extraData.feeIndex = solution.feeIndex
  }
  if (sourceCard) {
    return {
      type: 'ok',
      resourcesPaid,
      logKey: 'log.cardEffectPay',
      logParams: { cost: resourcesPaid, cardId: sourceCard },
      extraData,
    }
  }
  return {
    type: 'ok',
    resourcesPaid,
    extraData,
  }
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
  execute: ({ player, params, sourceCard, state }) => {
    const p = params as PayParams | undefined
    if (!p?.cost) return { type: 'fail', logKey: 'log.payFail' }
    if (isComplexCost(p.cost)) {
      const optionPrefix = p.optionPrefix ?? 'pay:generic'
      const selection = resolveCostPaymentSelection(
        player,
        p.cost,
        optionPrefix,
        p.paymentChoice,
        { type: 'fail', logKey: 'log.payFail' },
        { costType: p.costType, includeReturnedCard: p.includeReturnedCard },
      )
      if (selection.type !== 'selected') {
        return selection
      }
      return buildSelectedResult(
        selection.solution,
        sourceCard,
        p.costType,
        player,
        state,
      )
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

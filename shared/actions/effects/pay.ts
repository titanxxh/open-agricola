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
  returnCardToBoard,
} from '../helpers/payment'
import { resolveCostPaymentSelection } from '../helpers/pay-helpers'

export type PayParams = {
  cost: Partial<Resource> | ComplexCost
  costType?: CostModifierType
  optionPrefix?: string
  paymentChoice?: string
  includeReturnedCard?: boolean
}

/**
 * Pay leaf success result includes `extraData.bonusUsed` (string[] of card ids
 * whose BonusModifier.sources fired this payment), `bonusChoiceIndex`
 * (per-card chosen variant index, only when the bonus had multiple choices),
 * `feeIndex` (which fee variant in a fees[] array was paid), and
 * `returnedCardId` (when `includeReturnedCard` was set on params and the
 * payment consumed a card).
 *
 * Listeners on `actions: ['pay']` read these via `context.result.extraData`.
 * This is the canonical signal for "the card I own contributed to this
 * payment" — see E54_Contraband / E122_Cottar / E128_Saddler /
 * E123_ResourceHoarder for examples.
 *
 * Legacy note: `player._activeActionBonusSources` is still maintained by
 * `executePaymentSolution` for `log.actionDetail` attribution (read by
 * `GameCore.buildActionDetailParts`) and the legacy `playOccupation` /
 * `playImprovement` HTTP entries that don't go through the `pay` leaf.
 * New listeners should not depend on it.
 */

const RESOURCE_KEYS = new Set([
  'wood',
  'clay',
  'reed',
  'stone',
  'food',
  'grain',
  'vegetable',
  'sheep',
  'boar',
  'cattle',
  'begging',
])

const PAY_PARAM_KEYS = new Set([
  'cost',
  'costType',
  'optionPrefix',
  'paymentChoice',
  'includeReturnedCard',
])

const looksLikeFlatResource = (
  raw: Record<string, unknown> | undefined,
): boolean => {
  if (!raw) return false
  const keys = Object.keys(raw)
  if (keys.length === 0) return false
  if (keys.some((k) => PAY_PARAM_KEYS.has(k))) return false
  return keys.every((k) => RESOURCE_KEYS.has(k))
}

const normalizePayParams = (
  raw: Record<string, unknown> | undefined,
): PayParams | undefined => {
  if (!raw) return undefined
  if ('cost' in raw) return raw as unknown as PayParams
  if (looksLikeFlatResource(raw)) {
    return { cost: raw as Partial<Resource> }
  }
  return undefined
}

const buildSelectedResult = (
  solution: PaymentSolution,
  sourceCard: string | undefined,
  costType: CostModifierType | undefined,
  player: import('../../game/types').PlayerState,
  state: import('../../game/types').GameState,
  includeReturnedCard?: boolean,
): ActionExecutionResult => {
  executePaymentSolution(player, solution, { costType, state })
  if (includeReturnedCard && solution.cardUsed) {
    returnCardToBoard(player, solution.cardUsed, state)
  }
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
      const p = normalizePayParams(params)
      if (!p?.cost) return {}
      if (isComplexCost(p.cost)) return p.cost.fee ?? {}
      return p.cost
    },
  },
  execute: ({ player, params, sourceCard, state }) => {
    const p = normalizePayParams(params)
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
        p.includeReturnedCard,
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

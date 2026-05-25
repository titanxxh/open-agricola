/**
 * Typed-flat cost path: payTypedFlatCost, payTypedFlatCostDetailed,
 * canAffordTypedFlatCost, executeResolvedTypedFlatPayment,
 * resolveTypedFlatPaymentSelection, canAffordCost. Variant of the payment
 * path for costs typed by category (e.g. "construct" vs "renovation") with
 * cost-modifier matching.
 *
 * Internal to shared/actions/payment/. Not exported from the package
 * barrel (shared/actions/payment/index.ts). Use PaymentSolver from
 * the public API instead.
 */

import type {
  ActionExecutionResult,
  ComplexCost,
  CostModifierType,
  GameState,
  PaymentResourceMap,
  PaymentSolution,
  PlayerState,
} from '../../../contract/types'
import { isComplexCost } from './affordability'
import { computeAllBuyableCombinations } from './enumerate'
import { executePaymentSolution } from './execute'
import { resolveCostPaymentSelection } from './payment-choice-result'

type TypedFlatPaymentSelection =
  | ActionExecutionResult
  | {
      type: 'selected'
      solution: PaymentSolution
    }

export const resolveTypedFlatPaymentSelection = (
  player: PlayerState,
  baseCost: PaymentResourceMap | ComplexCost,
  optionValuePrefix: string,
  paymentChoice: string | undefined,
  failure: ActionExecutionResult,
  costType?: CostModifierType,
  state?: GameState,
): TypedFlatPaymentSelection => {
  const complex: ComplexCost = isComplexCost(baseCost)
    ? baseCost
    : { fee: baseCost }
  return resolveCostPaymentSelection(
    player,
    complex,
    optionValuePrefix,
    paymentChoice,
    failure,
    {
      costType,
      state,
    },
  )
}

export const executeResolvedTypedFlatPayment = (
  player: PlayerState,
  payment: Extract<TypedFlatPaymentSelection, { type: 'selected' }>,
  costType?: CostModifierType,
  state?: GameState,
) => {
  executePaymentSolution(player, payment.solution, { costType, state })
}

export const canAffordTypedFlatCost = (
  player: PlayerState,
  cost: PaymentResourceMap | ComplexCost,
  costType?: CostModifierType,
  state?: GameState,
): boolean => {
  const complex: ComplexCost = isComplexCost(cost)
    ? cost
    : { fee: cost }
  return computeAllBuyableCombinations(player, complex, undefined, costType, state).length > 0
}

export const payTypedFlatCost = (
  player: PlayerState,
  cost: PaymentResourceMap | ComplexCost,
  costType?: CostModifierType,
  state?: GameState,
): boolean => {
  const complex: ComplexCost = isComplexCost(cost)
    ? cost
    : { fee: cost }
  const solutions = computeAllBuyableCombinations(player, complex, undefined, costType, state)
  if (solutions.length === 0) return false
  executePaymentSolution(player, solutions[0]!, { costType, state })
  return true
}

export const payTypedFlatCostDetailed = (
  player: PlayerState,
  cost: PaymentResourceMap | ComplexCost,
  costType?: CostModifierType,
  state?: GameState,
):
  | {
      ok: true
      resourcesPaid: PaymentResourceMap
      bonusUsed?: string
      bonusChoiceIndex?: Record<string, number>
      cardUsed?: string
      feeIndex?: number
    }
  | { ok: false } => {
  const complex: ComplexCost = isComplexCost(cost)
    ? cost
    : { fee: cost }
  const solutions = computeAllBuyableCombinations(player, complex, undefined, costType, state)
  if (solutions.length === 0) return { ok: false }
  const solution = solutions[0]!
  executePaymentSolution(player, solution, { costType, state })
  return {
    ok: true,
    resourcesPaid: solution.resourcesPaid,
    bonusUsed: solution.bonusUsed,
    bonusChoiceIndex: solution.bonusChoiceIndex,
    cardUsed: solution.cardUsed,
    feeIndex: solution.feeIndex,
  }
}

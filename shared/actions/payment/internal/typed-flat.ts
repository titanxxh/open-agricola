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
  PaymentSolution,
  PlayerState,
  Resource,
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
  baseCost: Partial<Resource> | ComplexCost,
  optionValuePrefix: string,
  paymentChoice: string | undefined,
  failure: ActionExecutionResult,
  costType?: CostModifierType,
): TypedFlatPaymentSelection => {
  const complex: ComplexCost = isComplexCost(baseCost)
    ? baseCost
    : { fee: baseCost as Partial<Resource> }
  return resolveCostPaymentSelection(
    player,
    complex,
    optionValuePrefix,
    paymentChoice,
    failure,
    {
      costType,
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
  cost: Partial<Resource> | ComplexCost,
  costType?: CostModifierType,
): boolean => {
  const complex: ComplexCost = isComplexCost(cost)
    ? cost
    : { fee: cost as Partial<Resource> }
  return computeAllBuyableCombinations(player, complex, undefined, costType).length > 0
}

export const payTypedFlatCost = (
  player: PlayerState,
  cost: Partial<Resource> | ComplexCost,
  costType?: CostModifierType,
  state?: GameState,
): boolean => {
  const complex: ComplexCost = isComplexCost(cost)
    ? cost
    : { fee: cost as Partial<Resource> }
  const solutions = computeAllBuyableCombinations(player, complex, undefined, costType)
  if (solutions.length === 0) return false
  executePaymentSolution(player, solutions[0]!, { costType, state })
  return true
}

export const payTypedFlatCostDetailed = (
  player: PlayerState,
  cost: Partial<Resource> | ComplexCost,
  costType?: CostModifierType,
  state?: GameState,
):
  | {
      ok: true
      resourcesPaid: Partial<Resource>
      bonusUsed?: string
      bonusChoiceIndex?: Record<string, number>
      cardUsed?: string
      feeIndex?: number
    }
  | { ok: false } => {
  const complex: ComplexCost = isComplexCost(cost)
    ? cost
    : { fee: cost as Partial<Resource> }
  const solutions = computeAllBuyableCombinations(player, complex, undefined, costType)
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

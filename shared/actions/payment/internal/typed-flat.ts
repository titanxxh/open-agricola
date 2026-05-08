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
  CostModifier,
  CostModifierType,
  GameState,
  PaymentSolution,
  PlayerState,
  Resource,
} from '../../../contract/types'
import { canPayResources, payResources } from './affordability'
import { computeAllBuyableCombinations } from './enumerate'
import { executePaymentSolution } from './execute'
import { getModifiersForCostType } from './cost-modifiers'
import { resolveCostPaymentSelection } from './payment-choice-result'

const getTypedCostModifiers = (
  player: PlayerState,
  costType?: CostModifierType,
) => {
  if (!costType) return []
  return getModifiersForCostType(player, costType)
}

const resolveSimpleTradeAdjustedCost = (
  player: PlayerState,
  baseCost: Partial<Resource>,
  modifiers: CostModifier[],
): Partial<Resource> | null => {
  const fallbackBaseCost: Partial<Resource> | null =
    canPayResources(player, baseCost) ? baseCost : null

  for (const mod of modifiers) {
    if (mod.type !== 'trade') continue
    const fromKeys = Object.keys(mod.from) as (keyof Resource)[]
    const toPositiveKeys = (Object.keys(mod.to) as (keyof Resource)[]).filter(
      (k) => (mod.to[k] ?? 0) > 0,
    )

    if (fromKeys.length === 0 && toPositiveKeys.length === 1) {
      const toKey = toPositiveKeys[0]!
      const perUse = mod.to[toKey] ?? 0
      if (perUse <= 0 || (baseCost[toKey] ?? 0) <= 0) continue
      const maxCredit = (mod.max ?? Infinity) * perUse
      const virtualPaid = Math.min(baseCost[toKey] ?? 0, maxCredit)
      const altCost = { ...baseCost }
      altCost[toKey] = Math.max(0, (altCost[toKey] ?? 0) - virtualPaid)
      if (canPayResources(player, altCost)) {
        return altCost
      }
      continue
    }

    const toKey = Object.keys(mod.to)[0] as keyof typeof baseCost
    const fromKey = Object.keys(mod.from)[0] as keyof typeof baseCost
    const toAmount = mod.to[toKey as keyof typeof mod.to] ?? 0
    const fromAmount = mod.from[fromKey as keyof typeof mod.from] ?? 0

    if (toAmount <= 0 || fromAmount <= 0 || (baseCost[toKey] ?? 0) <= 0) {
      continue
    }

    const tradeable = Math.min(baseCost[toKey] ?? 0, mod.max ?? Infinity)
    const altCost = { ...baseCost }
    altCost[toKey] = Math.max(0, (altCost[toKey] ?? 0) - tradeable)
    altCost[fromKey] =
      (altCost[fromKey] ?? 0) + (tradeable * fromAmount / toAmount)

    if (canPayResources(player, altCost)) {
      return altCost
    }
  }

  return fallbackBaseCost
}

const resolveTypedFlatDirectPaymentCost = (
  player: PlayerState,
  baseCost: Partial<Resource>,
  modifiers: CostModifier[],
) => {
  if (modifiers.length === 0) {
    return canPayResources(player, baseCost) ? baseCost : null
  }
  return resolveSimpleTradeAdjustedCost(player, baseCost, modifiers)
}

const resolveTypedFlatPaymentSolution = (
  player: PlayerState,
  baseCost: Partial<Resource>,
  costType?: CostModifierType,
) => {
  const modifiers = getTypedCostModifiers(player, costType)
  const directCost = resolveTypedFlatDirectPaymentCost(
    player,
    baseCost,
    modifiers,
  )

  if (directCost) {
    return {
      type: 'direct' as const,
      directCost,
    }
  }

  if (modifiers.length === 0) {
    return null
  }

  const solution = computeAllBuyableCombinations(
    player,
    { fee: baseCost },
    undefined,
    costType,
  )[0]

  if (!solution) return null

  return {
    type: 'solution' as const,
    solution,
  }
}

type TypedFlatPaymentSelection =
  | ActionExecutionResult
  | {
      type: 'selected'
      solution: PaymentSolution
    }

export const resolveTypedFlatPaymentSelection = (
  player: PlayerState,
  baseCost: Partial<Resource>,
  optionValuePrefix: string,
  paymentChoice: string | undefined,
  failure: ActionExecutionResult,
  costType?: CostModifierType,
): TypedFlatPaymentSelection => {
  return resolveCostPaymentSelection(
    player,
    baseCost,
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
  baseCost: Partial<Resource>,
  costType?: CostModifierType,
) => {
  const resolved = resolveTypedFlatPaymentSolution(player, baseCost, costType)
  return resolved !== null
}

export const payTypedFlatCost = (
  player: PlayerState,
  baseCost: Partial<Resource>,
  costType?: CostModifierType,
  state?: GameState,
) => {
  const resolved = resolveTypedFlatPaymentSolution(player, baseCost, costType)
  if (!resolved) return false
  if (resolved.type === 'direct') {
    payResources(player, resolved.directCost)
    return true
  }
  executePaymentSolution(player, resolved.solution, { costType, state })
  return true
}

export const payTypedFlatCostDetailed = (
  player: PlayerState,
  baseCost: Partial<Resource>,
  costType?: CostModifierType,
  state?: GameState,
):
  | { ok: true; resourcesPaid: Partial<Resource>; bonusUsed?: string; cardUsed?: string; feeIndex?: number }
  | { ok: false } => {
  const resolved = resolveTypedFlatPaymentSolution(player, baseCost, costType)
  if (!resolved) return { ok: false }
  if (resolved.type === 'direct') {
    payResources(player, resolved.directCost)
    return { ok: true, resourcesPaid: resolved.directCost }
  }
  executePaymentSolution(player, resolved.solution, { costType, state })
  return {
    ok: true,
    resourcesPaid: resolved.solution.resourcesPaid,
    bonusUsed: resolved.solution.bonusUsed,
    cardUsed: resolved.solution.cardUsed,
    feeIndex: resolved.solution.feeIndex,
  }
}


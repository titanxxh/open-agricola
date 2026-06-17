import type { GameState } from '../../contract/types'
import type {
  Cost,
  Option,
  PaymentChoice,
  PaymentCtx,
  PaymentExecuteResult,
} from './types'
import {
  isComplexCost,
  canPayResources,
  canPaySupplyTokens,
  payResources,
  paySupplyTokens,
} from './internal/affordability'
import { clearPaymentCache } from './internal/cache'
import { computeAllBuyableCombinations } from './internal/enumerate'
import {
  canConsumePaymentResourceProviders,
  executePaymentSolution,
} from './internal/execute'

const computeOptions = (
  state: GameState,
  idx: number,
  cost: Cost,
  ctx: PaymentCtx,
): Option[] => {
  const player = state.players[idx]
  if (!player) return []
  if (!isComplexCost(cost)) {
    const simpleCost = cost as Parameters<typeof canPayResources>[1]
    if (!canPayResources(player, simpleCost) || !canPaySupplyTokens(state, player, simpleCost)) return []
    return [{ resourcesPaid: simpleCost, tradesUsed: [] }]
  }
  const costTypeArg = ctx.costType === 'none' ? undefined : ctx.costType
  return computeAllBuyableCombinations(player, cost, ctx.playedCards, costTypeArg, state)
}

const canAfford = (
  state: GameState,
  idx: number,
  cost: Cost,
  ctx: PaymentCtx,
): boolean => {
  const player = state.players[idx]
  if (!player) return false
  if (!isComplexCost(cost)) {
    const simpleCost = cost as Parameters<typeof canPayResources>[1]
    return canPayResources(player, simpleCost) && canPaySupplyTokens(state, player, simpleCost)
  }
  return computeOptions(state, idx, cost, ctx).length > 0
}

const execute = (
  state: GameState,
  idx: number,
  cost: Cost,
  choice: PaymentChoice,
  ctx: PaymentCtx,
): PaymentExecuteResult => {
  const player = state.players[idx]
  if (!player) {
    return { ok: false, reason: 'cannot-afford' }
  }
  const options = computeOptions(state, idx, cost, ctx)
  if (options.length === 0) {
    return { ok: false, reason: 'cannot-afford' }
  }
  if (choice.optionIndex < 0 || choice.optionIndex >= options.length) {
    return { ok: false, reason: 'invalid-choice' }
  }
  const selected = options[choice.optionIndex]
  if (!selected) {
    return { ok: false, reason: 'unknown-option' }
  }
  if (!isComplexCost(cost)) {
    payResources(player, cost as Parameters<typeof payResources>[1])
    paySupplyTokens(player, cost as Parameters<typeof payResources>[1])
  } else {
    if (!canConsumePaymentResourceProviders(state, selected, cost.paymentResourceProviders)) {
      return { ok: false, reason: 'cannot-afford' }
    }
    executePaymentSolution(player, selected, {
      state,
      paymentResourceProviders: cost.paymentResourceProviders,
    })
  }
  return { ok: true, state }
}

const pickAuto = (options: Option[]): Option | undefined => {
  return options.length === 1 ? options[0] : undefined
}

const clearCache = (): void => {
  clearPaymentCache()
}

const isComplexCostPublic: typeof isComplexCost = (cost) => isComplexCost(cost)

export const PaymentSolver = {
  computeOptions,
  canAfford,
  execute,
  pickAuto,
  clearCache,
  isComplexCost: isComplexCostPublic,
} as const

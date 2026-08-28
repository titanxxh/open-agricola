import type { GameState } from '../../contract/types'
import type {
  Cost,
  Option,
  PaymentCtx,
  PaymentReceipt,
  PaymentResolveResult,
} from './types'
import {
  isComplexCost,
  canPayResources,
  canPaySupplyTokens,
  applyCostOverride,
  payResources,
  paySupplyTokens,
} from './internal/affordability'
import { clearPaymentCache } from './internal/cache'
import { computeAllBuyableCombinations } from './internal/enumerate'
import {
  applyTradeSideEffect,
  canConsumePaymentResourceProviders,
  executePaymentSolution,
} from './internal/execute'
import {
  addCardCostCandidateAttribution,
  cardCostCandidateMetadataForSolution,
  discountCardCostCandidate,
  filterPaymentSolutionsByReserve,
  resolvePaymentSolutionSelection,
} from './internal'
import {
  canAffordActionPreviewCost,
  canAffordCardPreviewCostByProvider,
  payCardPreviewCostByProvider,
  resolveActionPreviewCost,
  resolveCardPreviewCostByProvider,
  resolveCardPreviewCostDetailedByProvider,
} from './internal/preview-cost'
import {
  canAffordTypedFlatCost,
  executeResolvedTypedFlatPayment,
  payTypedFlatCost,
  payTypedFlatCostDetailed,
  resolveTypedFlatPaymentSelection,
} from './internal/typed-flat'
import {
  readExactCost,
  resolveExactUnitCost,
  resolveUnitCostWithDelta,
} from './internal/exact-cost'
import {
  buildConstructCost,
  getBuildRoomCost,
  getMaxBuildableRooms,
  readConstructCostDelta,
  resolveRoomPaymentSelection,
} from './internal/room-payment'

const normalizePaymentChoiceValue = (
  paymentChoice: string | undefined,
  optionValuePrefix: string,
) => {
  if (!paymentChoice) return undefined
  const prefix = `${optionValuePrefix}:`
  return paymentChoice.startsWith(prefix)
    ? paymentChoice.slice(prefix.length)
    : paymentChoice
}

const solutionPaymentResourceProviders = (cost: Cost, ctx: PaymentCtx) =>
  ctx.paymentResourceProviders ?? (
    isComplexCost(cost) ? cost.paymentResourceProviders : undefined
  )

const receiptForSolution = (
  solution: Option,
  cost: Cost,
  ctx: PaymentCtx,
): PaymentReceipt => {
  const metadata = cardCostCandidateMetadataForSolution(
    ctx.candidateMetadataByFeeIndex,
    solution,
  )
  const paymentSources = [...new Set([
    ...(metadata?.sources ?? []),
    ...solution.tradesUsed
      .filter((entry) => entry.times > 0)
      .map((entry) => entry.trade.sourceId)
      .filter((source): source is string => Boolean(source)),
  ])]
  return {
    solution,
    resourcesPaid: solution.resourcesPaid,
    ...(solution.bonusUsed ? { bonusUsed: solution.bonusUsed } : {}),
    ...(solution.bonusChoiceIndex ? { bonusChoiceIndex: solution.bonusChoiceIndex } : {}),
    ...(ctx.includeReturnedCard && solution.cardUsed ? { returnedCardId: solution.cardUsed } : {}),
    ...(solution.feeIndex !== undefined ? { feeIndex: solution.feeIndex } : {}),
    ...(metadata?.originalFeeIndex !== undefined ? { originalFeeIndex: metadata.originalFeeIndex } : {}),
    ...(paymentSources.length > 0 ? { candidateSources: paymentSources } : {}),
    ...(metadata?.costAttribution ? { costAttribution: metadata.costAttribution } : {}),
    ...(solutionPaymentResourceProviders(cost, ctx)
      ? { paymentResourceProviders: solutionPaymentResourceProviders(cost, ctx) }
      : {}),
  }
}

const normalizeLifecycleCost = (cost: Cost, ctx: PaymentCtx): Cost =>
  !isComplexCost(cost) && ctx.costType !== 'none'
    ? { fee: cost }
    : cost

const computeLifecycleOptions = (
  state: GameState,
  idx: number,
  cost: Cost,
  ctx: PaymentCtx,
): { cost: Cost; options: Option[] } => {
  const player = state.players[idx]
  const effectiveCost = normalizeLifecycleCost(cost, ctx)
  if (!player) return { cost: effectiveCost, options: [] }
  return {
    cost: effectiveCost,
    options: filterPaymentSolutionsByReserve(
      player,
      computeOptions(state, idx, effectiveCost, ctx),
      ctx.reserveResources,
    ),
  }
}

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
  return filterPaymentSolutionsByReserve(
    player,
    computeAllBuyableCombinations(player, cost, ctx.playedCards, costTypeArg, state),
    ctx.reserveResources,
  )
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

const resolvePayment = (
  state: GameState,
  idx: number,
  cost: Cost,
  ctx: PaymentCtx,
): PaymentResolveResult => {
  const player = state.players[idx]
  if (!player) return { type: 'failed', reason: 'cannot-afford' }
  const { cost: effectiveCost, options } = computeLifecycleOptions(state, idx, cost, ctx)
  const paymentResourceProviders = solutionPaymentResourceProviders(effectiveCost, ctx)
  const optionPrefix = ctx.optionPrefix ?? 'pay:generic'
  const selection = resolvePaymentSolutionSelection(
    options,
    normalizePaymentChoiceValue(ctx.paymentChoice, optionPrefix),
    optionPrefix,
    ctx.includeReturnedCard ?? false,
    { type: 'fail', errorKey: 'log.payFail' },
    {
      extraSourcesForSolution: (solution) =>
        cardCostCandidateMetadataForSolution(
          ctx.candidateMetadataByFeeIndex,
          solution,
        )?.sources ?? [],
      paymentResourceProviders,
    },
  )
  if (selection.type === 'request') {
    return { type: 'request', request: selection }
  }
  if (selection.type !== 'selected') {
    return { type: 'failed', reason: options.length === 0 ? 'cannot-afford' : 'invalid-choice' }
  }
  if (isComplexCost(effectiveCost)) {
    if (!canConsumePaymentResourceProviders(state, selection.solution, paymentResourceProviders)) {
      return { type: 'failed', reason: 'cannot-afford' }
    }
    executePaymentSolution(player, selection.solution, {
      state,
      costType: ctx.costType === 'none' ? undefined : ctx.costType,
      paymentResourceProviders,
    })
  } else {
    payResources(player, selection.solution.resourcesPaid, state)
    paySupplyTokens(player, selection.solution.resourcesPaid)
  }
  return { type: 'paid', receipt: receiptForSolution(selection.solution, effectiveCost, ctx) }
}

const hasPaymentOption = (
  state: GameState,
  idx: number,
  cost: Cost,
  ctx: PaymentCtx,
): boolean => computeLifecycleOptions(state, idx, cost, ctx).options.length > 0

const clearCache = (): void => {
  clearPaymentCache()
}

const isComplexCostPublic: typeof isComplexCost = (cost) => isComplexCost(cost)

export const PaymentSolver = {
  computeOptions,
  canAfford,
  resolvePayment,
  hasPaymentOption,
  resolveActionPreviewCost,
  canAffordActionPreviewCost,
  resolveCardPreviewCostByProvider,
  resolveCardPreviewCostDetailedByProvider,
  canAffordCardPreviewCostByProvider,
  payCardPreviewCostByProvider,
  canAffordTypedFlatCost,
  payTypedFlatCost,
  payTypedFlatCostDetailed,
  resolveTypedFlatPaymentSelection,
  executeResolvedTypedFlatPayment,
  discountCardCostCandidate,
  addCardCostCandidateAttribution,
  applyCostOverride,
  canPayResources,
  payResources,
  applyTradeSideEffect,
  readExactCost,
  resolveExactUnitCost,
  resolveUnitCostWithDelta,
  buildConstructCost,
  getBuildRoomCost,
  getMaxBuildableRooms,
  readConstructCostDelta,
  resolveRoomPaymentSelection,
  clearCache,
  isComplexCost: isComplexCostPublic,
} as const

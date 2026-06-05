/**
 * Preview-cost family: resolveCardCostWithModifiers,
 * canAffordCardPreviewCostByProvider, payCardPreviewCostByProvider,
 * resolveCardPreviewCostByProvider, canAffordActionPreviewCost,
 * resolveActionPreviewCost.
 *
 * "Preview" semantics — used to display projected cost in UI affordability
 * checks before the player commits. May migrate to cards/UI domain in S4.
 *
 * Internal to shared/actions/payment/. Not exported from the package
 * barrel (shared/actions/payment/index.ts). Use PaymentSolver from
 * the public API instead.
 */

import type {
  ActionAvailabilityContext,
  Bonus,
  ComplexCost,
  CostModifierType,
  GameState,
  PaymentResourceMap,
  PlayerState,
  Resource,
  Trade,
} from '../../../contract/types'
import type {
  CostCandidateDerivationContext,
  CostCandidateDeriver,
} from '../../cost-candidate-deriver'
import { executeCardListener, getMatchingListeners, listenerOwnerOptions } from '../../../cards/card-listeners'
import { getCardDefinitionById, getCardPrimaryType } from '../../../cards/helpers/card-type'
import { applyCostOverride, isComplexCost } from './affordability'
import {
  applyCostDeltasToCandidates,
  deriveCostCandidates,
  expandCostCandidates,
} from './cost-candidates'
import { canPayCost, computeAllBuyableCombinations } from './enumerate'
import { executePaymentSolution } from './execute'
import { buildCardCostListenerContext } from './hook-context'
import { canAffordTypedFlatCost, payTypedFlatCost } from './typed-flat'

const collectTargetCardTypes = (cardId: string): Array<'major' | 'minor'> => {
  const result: Array<'major' | 'minor'> = []
  const add = (value: unknown) => {
    if ((value === 'major' || value === 'minor') && !result.includes(value)) {
      result.push(value)
    }
  }
  add(getCardPrimaryType(cardId))
  getCardDefinitionById(cardId)?.alsoCountsAs?.forEach(add)
  return result
}

const buildCostCandidateDerivationContext = (
  actionId: string,
  cardId: string,
  actionCardId: string | undefined,
): CostCandidateDerivationContext => {
  const targetCardTypes = collectTargetCardTypes(cardId)
  if (targetCardTypes.length === 0) {
    throw new Error(`candidateDeriver targetCardId=${cardId} empty targetCardTypes`)
  }
  return {
    actionId,
    targetCardId: cardId,
    targetPlayKind: targetCardTypes[0],
    targetCardTypes,
    actionCardId,
  }
}

const buildCostFromCandidates = (
  baseCost: PaymentResourceMap | ComplexCost,
  candidates: ReturnType<typeof expandCostCandidates>,
  collectedBonuses: Bonus[],
  collectedTrades: Trade[],
): PaymentResourceMap | ComplexCost => {
  const baseComplex = isComplexCost(baseCost) ? baseCost : undefined
  const fees = candidates.map((candidate) => candidate.cost)
  const costCandidateSourceCards = candidates.map((candidate) => candidate.metadata.sourceCards)
  const costCandidateFeeIndices = candidates.map((candidate, index) => candidate.feeIndex ?? index)
  const hasCostCandidateSources = costCandidateSourceCards.some((sourceCards) => sourceCards.length > 0)
  const hasCostCandidateFeeIndexRemap = costCandidateFeeIndices.some((feeIndex, index) => feeIndex !== index)
  if (!baseComplex && fees.length === 1 && collectedBonuses.length === 0 && collectedTrades.length === 0 && !hasCostCandidateSources) {
    return fees[0] ?? {}
  }

  const complexCost: ComplexCost = {}
  if (baseComplex?.unitFee) complexCost.unitFee = baseComplex.unitFee
  if (baseComplex?.nb !== undefined) complexCost.nb = baseComplex.nb
  if (baseComplex?.cards) complexCost.cards = baseComplex.cards
  if (baseComplex?.costCandidateSourceCards) complexCost.costCandidateSourceCards = baseComplex.costCandidateSourceCards
  if (baseComplex?.costCandidateFeeIndices) complexCost.costCandidateFeeIndices = baseComplex.costCandidateFeeIndices
  if (fees.length === 1 && !baseComplex?.fees) {
    complexCost.fee = fees[0] ?? {}
  } else {
    complexCost.fees = fees
  }
  if (hasCostCandidateSources) {
    complexCost.costCandidateSourceCards = costCandidateSourceCards
  }
  if (hasCostCandidateFeeIndexRemap) {
    complexCost.costCandidateFeeIndices = costCandidateFeeIndices
  }
  const trades = [
    ...(baseComplex?.trades ?? []),
    ...collectedTrades,
  ]
  const bonuses = [
    ...(baseComplex?.bonuses ?? []),
    ...collectedBonuses,
  ]
  if (trades.length > 0) complexCost.trades = trades
  if (bonuses.length > 0) complexCost.bonuses = bonuses
  return complexCost
}

export const resolveCardCostWithModifiers = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  cardId: string,
  baseCost: PaymentResourceMap | ComplexCost,
  actionCardId?: string,
): PaymentResourceMap | ComplexCost => {
  const context = buildCardCostListenerContext(state, player, actionId)
  const matched = getMatchingListeners(context)
  const collectedBonuses: Bonus[] = []
  const collectedTrades: Trade[] = []
  const collectedCostDeltas: Partial<Resource>[] = []
  const collectedDerivers: CostCandidateDeriver[] = []

  for (const entry of matched) {
    const listenerContext = {
      ...context,
      cardId,
      actionCardId,
    }
    const result = executeCardListener(entry.registration, listenerContext, listenerOwnerOptions(entry))
    if (result?.costs) {
      collectedCostDeltas.push(result.costs)
    }
    if (result?.bonuses) {
      collectedBonuses.push(...result.bonuses)
    }
    if (result?.trades) {
      collectedTrades.push(...result.trades)
    }
    if (result?.candidateDerivers) {
      collectedDerivers.push(...result.candidateDerivers)
    }
  }

  if (
    collectedCostDeltas.length === 0 &&
    collectedDerivers.length === 0 &&
    collectedBonuses.length === 0 &&
    collectedTrades.length === 0
  ) {
    return baseCost
  }

  const adjustedCandidates = applyCostDeltasToCandidates(
    expandCostCandidates(baseCost),
    collectedCostDeltas,
  )
  const candidates = collectedDerivers.length > 0
    ? deriveCostCandidates(
      adjustedCandidates,
      collectedDerivers,
      buildCostCandidateDerivationContext(actionId, cardId, actionCardId),
    )
    : adjustedCandidates

  return buildCostFromCandidates(
    baseCost,
    candidates,
    collectedBonuses,
    collectedTrades,
  )
}

const resolveCardPreviewCost = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  cardId: string,
  baseCost: PaymentResourceMap | ComplexCost | null | undefined,
  actionCardId?: string,
): PaymentResourceMap | ComplexCost | null => {
  if (!baseCost) return null
  return resolveCardCostWithModifiers(
    state,
    player,
    actionId,
    cardId,
    baseCost,
    actionCardId,
  )
}

export const resolveCardPreviewCostByProvider = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  cardId: string,
  getBaseCost: () => PaymentResourceMap | ComplexCost | null | undefined,
  actionCardId?: string,
) =>
  resolveCardPreviewCost(
    state,
    player,
    actionId,
    cardId,
    getBaseCost(),
    actionCardId,
  )

const canAffordCardPreviewCost = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  cardId: string,
  baseCost: PaymentResourceMap | ComplexCost | null | undefined,
  actionCardId?: string,
  costType?: CostModifierType,
) =>
  (() => {
    const previewCost = resolveCardPreviewCost(
      state,
      player,
      actionId,
      cardId,
      baseCost,
      actionCardId,
    )
    if (!previewCost) return false
    if (!isComplexCost(previewCost)) {
      return canAffordTypedFlatCost(player, previewCost, costType, state)
    }
    return canPayCost(player, previewCost, costType, state)
  })()

export const canAffordCardPreviewCostByProvider = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  cardId: string,
  getBaseCost: () => PaymentResourceMap | ComplexCost | null | undefined,
  actionCardId?: string,
  costType?: CostModifierType,
) =>
  canAffordCardPreviewCost(
    state,
    player,
    actionId,
    cardId,
    getBaseCost(),
    actionCardId,
    costType,
  )

const payCardPreviewCost = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  cardId: string,
  baseCost: PaymentResourceMap | ComplexCost | null | undefined,
  actionCardId?: string,
  costType?: CostModifierType,
) => {
  const previewCost = resolveCardPreviewCost(
    state,
    player,
    actionId,
    cardId,
    baseCost,
    actionCardId,
  )
  if (previewCost === null) return false
  if (!isComplexCost(previewCost)) {
    return payTypedFlatCost(player, previewCost, costType, state)
  }
  const solution = computeAllBuyableCombinations(
    player,
    previewCost,
    undefined,
    costType,
    state,
  )[0]
  if (!solution) return false
  executePaymentSolution(player, solution, { costType, state })
  return true
}

export const payCardPreviewCostByProvider = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  cardId: string,
  getBaseCost: () => PaymentResourceMap | ComplexCost | null | undefined,
  actionCardId?: string,
  costType?: CostModifierType,
) =>
  payCardPreviewCost(
    state,
    player,
    actionId,
    cardId,
    getBaseCost(),
    actionCardId,
    costType,
  )

export const resolveActionPreviewCost = (
  context: ActionAvailabilityContext,
  getBaseCost: (context: ActionAvailabilityContext) => Partial<Resource>,
  costOverride?: Partial<Resource>,
) => applyCostOverride(getBaseCost(context), costOverride)

export const canAffordActionPreviewCost = (
  context: ActionAvailabilityContext,
  getBaseCost: (context: ActionAvailabilityContext) => Partial<Resource>,
  costOverride?: Partial<Resource>,
) =>
  canAffordCost(
    context.player,
    resolveActionPreviewCost(context, getBaseCost, costOverride),
    context.state,
  )

export const canAffordCost = (
  player: PlayerState,
  cost: PaymentResourceMap | ComplexCost | undefined,
  state?: GameState,
) => {
  if (!cost) return true
  return canPayCost(player, cost, undefined, state)
}

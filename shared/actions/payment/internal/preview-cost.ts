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
  CardCostCandidateMetadata,
  ComplexCost,
  CostModifierType,
  GameState,
  PaymentResourceMap,
  PlayerState,
  Resource,
  Trade,
} from '../../../contract/types'
import { buildCardListenerContext, executeCardListener, getMatchingListeners, listenerOwnerOptions } from '../../../cards/card-listeners'
import { applyCostOverride, isComplexCost } from './affordability'
import {
  buildCandidateMetadataByFeeIndex,
  cardCostCandidatesEqual,
  dedupeCardCostCandidates,
  normalizeCardCostCandidates,
} from './card-cost-candidates'
import { canPayCost, computeAllBuyableCombinations } from './enumerate'
import { executePaymentSolution } from './execute'
import { buildCardCostListenerContext } from './hook-context'
import { canAffordTypedFlatCost, payTypedFlatCost } from './typed-flat'

export type ResolvedCardCostWithMetadata = {
  cost: PaymentResourceMap | ComplexCost
  candidateMetadataByFeeIndex?: Record<number, CardCostCandidateMetadata>
}

export const resolveCardCostWithModifiersDetailed = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  cardId: string,
  baseCost: PaymentResourceMap | ComplexCost,
  actionCardId?: string,
): ResolvedCardCostWithMetadata => {
  const context = buildCardCostListenerContext(state, player, actionId)
  const matched = getMatchingListeners(context)
  const collectedBonuses: Bonus[] = []
  const collectedTrades: Trade[] = []
  let cost: PaymentResourceMap = isComplexCost(baseCost) ? {} : { ...baseCost }
  let candidates = normalizeCardCostCandidates(baseCost)
  let usedCandidatePipeline = false

  for (const entry of matched) {
    const listenerContext = {
      ...context,
      cardId,
      actionCardId,
    }
    if (entry.registration.computeCardCostCandidates) {
      const builtContext = buildCardListenerContext(
        entry.registration,
        listenerContext,
        listenerOwnerOptions(entry),
      )
      const nextCandidates = dedupeCardCostCandidates(
        entry.registration.computeCardCostCandidates(builtContext, candidates),
      )
      if (!cardCostCandidatesEqual(candidates, nextCandidates)) {
        usedCandidatePipeline = true
      }
      candidates = nextCandidates
    }
    const result = executeCardListener(entry.registration, listenerContext, listenerOwnerOptions(entry))
    if (result?.costs && !isComplexCost(baseCost)) {
      cost = applyCostOverride(cost, result.costs)
      candidates = dedupeCardCostCandidates(
        candidates.map((candidate) => ({
          ...candidate,
          resources: applyCostOverride(candidate.resources, result.costs!),
        })),
      )
    }
    if (result?.bonuses) {
      collectedBonuses.push(...result.bonuses)
    }
    if (result?.trades) {
      collectedTrades.push(...result.trades)
    }
  }

  if (usedCandidatePipeline) {
    const complexCost: ComplexCost = {
      ...(isComplexCost(baseCost) ? baseCost : {}),
      fee: undefined,
      fees: candidates.map((candidate) => ({ ...candidate.resources })),
    }
    if (collectedTrades.length > 0) {
      complexCost.trades = [
        ...(isComplexCost(baseCost) ? baseCost.trades ?? [] : []),
        ...collectedTrades,
      ]
    }
    if (collectedBonuses.length > 0) {
      complexCost.bonuses = [
        ...(isComplexCost(baseCost) ? baseCost.bonuses ?? [] : []),
        ...collectedBonuses,
      ]
    }
    return {
      cost: complexCost,
      candidateMetadataByFeeIndex: buildCandidateMetadataByFeeIndex(candidates),
    }
  }

  if (isComplexCost(baseCost)) {
    if (collectedBonuses.length === 0 && collectedTrades.length === 0) {
      return { cost: baseCost }
    }
    const merged: ComplexCost = { ...baseCost }
    if (collectedTrades.length > 0) {
      merged.trades = [...(baseCost.trades ?? []), ...collectedTrades]
    }
    if (collectedBonuses.length > 0) {
      merged.bonuses = [...(baseCost.bonuses ?? []), ...collectedBonuses]
    }
    return { cost: merged }
  }

  if (collectedBonuses.length > 0 || collectedTrades.length > 0) {
    const complexCost: ComplexCost = {
      fee: cost,
    }
    if (collectedBonuses.length > 0) {
      complexCost.bonuses = collectedBonuses
    }
    if (collectedTrades.length > 0) {
      complexCost.trades = collectedTrades
    }
    return { cost: complexCost }
  }

  return { cost }
}

export const resolveCardCostWithModifiers = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  cardId: string,
  baseCost: PaymentResourceMap | ComplexCost,
  actionCardId?: string,
): PaymentResourceMap | ComplexCost =>
  resolveCardCostWithModifiersDetailed(
    state,
    player,
    actionId,
    cardId,
    baseCost,
    actionCardId,
  ).cost

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

const resolveCardPreviewCostDetailed = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  cardId: string,
  baseCost: PaymentResourceMap | ComplexCost | null | undefined,
  actionCardId?: string,
): ResolvedCardCostWithMetadata | null => {
  if (!baseCost) return null
  return resolveCardCostWithModifiersDetailed(
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

export const resolveCardPreviewCostDetailedByProvider = (
  state: GameState,
  player: PlayerState,
  actionId: string,
  cardId: string,
  getBaseCost: () => PaymentResourceMap | ComplexCost | null | undefined,
  actionCardId?: string,
) =>
  resolveCardPreviewCostDetailed(
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

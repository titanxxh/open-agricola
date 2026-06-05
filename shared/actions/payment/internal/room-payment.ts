/**
 * Room construction payment: buildConstructCost, getBuildRoomCost,
 * getMaxBuildableRooms, executeResolvedRoomPayment, resolveRoomPaymentSelection.
 * Variant of the payment path scoped to per-unit room construction.
 * Routes through computeAllBuyableCombinations (via canPayCost / resolveCostPaymentSelection)
 * with costType:'construct' so cost modifiers are honoured uniformly.
 *
 * Internal to shared/actions/payment/. Not exported from the package
 * barrel (shared/actions/payment/index.ts). Use PaymentSolver from
 * the public API instead.
 */

import type {
  ActionCostHookResult,
  ActionExecutionResult,
  Bonus,
  ComplexCost,
  ExactCost,
  PaymentResourceKey,
  PaymentResourceMap,
  PaymentSolution,
  PlayerState,
  Resource,
  Trade,
} from '../../../contract/types'
import type { CostCandidateDeriver } from '../../cost-candidate-deriver'
import { getAllTilePositions, positionKey } from '../../../domain/farm'
import { resolveCostPaymentSelection } from './payment-choice-result'
import { executeResolvedTypedFlatPayment } from './typed-flat'
import { canPayCost } from './enumerate'
import { readExactCost, resolveUnitCostWithDelta } from './exact-cost'
import {
  deriveCostCandidates,
  expandCostCandidates,
  normalizeCost,
} from './cost-candidates'

export const getBuildRoomCost = (houseType: PlayerState['houseType']) => {
  if (houseType === 'clay') return { clay: 5, reed: 2 }
  if (houseType === 'stone') return { stone: 5, reed: 2 }
  return { wood: 5, reed: 2 }
}

const readCostOverride = (
  actionContext?: Record<string, unknown>,
): Partial<Resource> | undefined => {
  const override = actionContext?.costOverride
  if (!override || typeof override !== 'object') return undefined
  return override as Partial<Resource>
}

export const readConstructCostDelta = (
  actionContext: Record<string, unknown> | undefined,
  costs: Partial<Resource> | undefined,
): Partial<Resource> | undefined => {
  if (costs && Object.keys(costs).length > 0) return costs
  return readExactCost(actionContext) ? undefined : readCostOverride(actionContext)
}

const resolveConstructUnitFee = (
  player: PlayerState,
  costDelta: Partial<Resource> | undefined,
  exactCost: ExactCost | undefined,
  nb: number,
): Partial<Resource> | null => {
  const defaultCost = getBuildRoomCost(player.houseType)
  if (resolveUnitCostWithDelta(defaultCost, exactCost, costDelta, nb) === null) {
    return null
  }
  return resolveUnitCostWithDelta(defaultCost, exactCost, costDelta, 1)
}

const collectActionCostExtras = (
  results: ActionCostHookResult[] | undefined,
): {
  bonuses: Bonus[]
  trades: Trade[]
  derivers: CostCandidateDeriver[]
} => {
  const bonuses: Bonus[] = []
  const trades: Trade[] = []
  const derivers: CostCandidateDeriver[] = []
  for (const result of results ?? []) {
    if (result.bonuses) bonuses.push(...result.bonuses)
    if (result.trades) trades.push(...result.trades)
    if (result.candidateDerivers) {
      derivers.push(...(result.candidateDerivers as CostCandidateDeriver[]))
    }
  }
  return { bonuses, trades, derivers }
}

const scaleResourceMap = (
  cost: PaymentResourceMap,
  count: number,
): PaymentResourceMap => {
  const result: PaymentResourceMap = {}
  for (const [key, value] of Object.entries(cost)) {
    if (typeof value !== 'number' || value === 0) continue
    result[key as PaymentResourceKey] = value * count
  }
  return normalizeCost(result)
}

const subtractResourceMap = (
  left: PaymentResourceMap,
  right: PaymentResourceMap,
): PaymentResourceMap => {
  const result: PaymentResourceMap = { ...left }
  for (const [key, value] of Object.entries(right)) {
    const resourceKey = key as PaymentResourceKey
    result[resourceKey] = (result[resourceKey] ?? 0) - (value ?? 0)
  }
  return normalizeCost(result)
}

const buildConstructCandidateCost = (
  unitFee: PaymentResourceMap,
  nb: number,
  derivers: CostCandidateDeriver[],
): Pick<ComplexCost, 'fees' | 'costCandidateSourceCards' | 'costCandidateFeeIndices'> => {
  const candidates = deriveCostCandidates(
    expandCostCandidates(unitFee),
    derivers,
    { actionId: 'construct' },
  )
  const baseTotal = scaleResourceMap(unitFee, nb)
  return {
    fees: candidates.map((candidate) =>
      subtractResourceMap(scaleResourceMap(candidate.cost, nb), baseTotal),
    ),
    costCandidateSourceCards: candidates.map((candidate) => candidate.metadata.sourceCards),
    costCandidateFeeIndices: candidates.map((candidate, index) => candidate.feeIndex ?? index),
  }
}

export const buildConstructCost = (
  player: PlayerState,
  costs: Partial<Resource> | undefined,
  nb: number,
  actionContext?: Record<string, unknown>,
  costHookResults?: ActionCostHookResult[],
): ComplexCost | null => {
  const costDelta = readConstructCostDelta(actionContext, costs)
  const unitFee = resolveConstructUnitFee(
    player,
    costDelta,
    readExactCost(actionContext),
    nb,
  )
  if (unitFee === null) return null
  const { bonuses, trades, derivers } = collectActionCostExtras(costHookResults)
  const cost: ComplexCost = { unitFee, nb }
  if (derivers.length > 0) {
    Object.assign(cost, buildConstructCandidateCost(unitFee, nb, derivers))
  }
  if (bonuses.length > 0) cost.bonuses = bonuses
  if (trades.length > 0) cost.trades = trades
  return cost
}

export const resolveConstructSelectionCostDelta = (
  player: PlayerState,
  costs: Partial<Resource> | undefined,
  actionContext?: Record<string, unknown>,
  costHookResults?: ActionCostHookResult[],
): Partial<Resource> | undefined => {
  const costDelta = readConstructCostDelta(actionContext, costs)
  const { derivers } = collectActionCostExtras(costHookResults)
  if (derivers.length === 0) return costDelta
  const exactCost = readExactCost(actionContext)
  const defaultUnitFee = resolveUnitCostWithDelta(
    getBuildRoomCost(player.houseType),
    exactCost,
    undefined,
    1,
  )
  const adjustedUnitFee = resolveConstructUnitFee(player, costDelta, exactCost, 1)
  if (!defaultUnitFee || !adjustedUnitFee) return costDelta
  const candidates = deriveCostCandidates(
    expandCostCandidates(adjustedUnitFee),
    derivers,
    { actionId: 'construct' },
  )
  const chosen = candidates.find((candidate) =>
    canPayCost(player, { unitFee: candidate.cost, nb: 1 }, 'construct'),
  ) ?? candidates[0]
  if (!chosen) return costDelta
  const delta = subtractResourceMap(chosen.cost, defaultUnitFee)
  return Object.keys(delta).length > 0 ? delta : undefined
}

const countAvailableRoomTiles = (player: PlayerState) => {
  const occupied = new Set(player.roomTiles.map(positionKey))
  player.fields.forEach((field) =>
    occupied.add(positionKey({ row: field.row, col: field.col })),
  )
  player.stableTiles.forEach((tile) => occupied.add(positionKey(tile)))
  player.pastures
    .flatMap((pasture) => pasture.tiles)
    .forEach((tile) => occupied.add(positionKey(tile)))
  return getAllTilePositions().filter((tile) => !occupied.has(positionKey(tile))).length
}

export const getMaxBuildableRooms = (
  player: PlayerState,
  costs?: Partial<Resource>,
  actionContext?: Record<string, unknown>,
  costHookResults?: ActionCostHookResult[],
): number => {
  const argMax = typeof actionContext?.maxRooms === 'number'
    ? Math.max(0, Math.floor(actionContext.maxRooms))
    : 99
  const structuralMax = Math.min(countAvailableRoomTiles(player), argMax)
  for (let nb = 1; nb <= structuralMax; nb += 1) {
    const cost = buildConstructCost(player, costs, nb, actionContext, costHookResults)
    if (!cost) return nb - 1
    if (!canPayCost(player, cost, 'construct')) return nb - 1
  }
  return structuralMax
}

const ROOM_PAYMENT_OPTION_PREFIX = 'pay:room'

type SelectedRoomPayment = {
  type: 'selected'
  solution: PaymentSolution
}

type RoomPaymentSelectionResult = ActionExecutionResult | SelectedRoomPayment

const ROOM_PAYMENT_FAILURE: ActionExecutionResult = {
  type: 'fail',
  errorKey: 'log.buildRoomFail',
}

export const resolveRoomPaymentSelection = (
  player: PlayerState,
  costs: Partial<Resource> | undefined,
  nb: number,
  paymentChoice?: string,
  actionContext?: Record<string, unknown>,
  costHookResults?: ActionCostHookResult[],
): RoomPaymentSelectionResult => {
  const cost = buildConstructCost(player, costs, nb, actionContext, costHookResults)
  if (!cost) return ROOM_PAYMENT_FAILURE
  const resolved = resolveCostPaymentSelection(
    player,
    cost,
    ROOM_PAYMENT_OPTION_PREFIX,
    paymentChoice,
    ROOM_PAYMENT_FAILURE,
    { costType: 'construct' },
  )
  if (resolved.type !== 'selected') return resolved
  return { type: 'selected', solution: resolved.solution }
}

export const executeResolvedRoomPayment = (
  player: PlayerState,
  resolution: SelectedRoomPayment,
) => {
  executeResolvedTypedFlatPayment(player, resolution, 'construct')
}

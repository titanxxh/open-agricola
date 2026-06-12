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
  ActionExecutionResult,
  Bonus,
  CardProvidedPaymentResourceProvider,
  ComplexCost,
  ExactCost,
  PaymentSolution,
  PlayerState,
  Resource,
  Trade,
} from '../../../contract/types'
import { getAllTilePositions, positionKey } from '../../../domain/farm'
import { resolveCostPaymentSelection } from './payment-choice-result'
import { executeResolvedTypedFlatPayment } from './typed-flat'
import { canPayCost } from './enumerate'
import { readExactCost, resolveUnitCostWithDelta } from './exact-cost'

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

export type ConstructCostAdjustments = {
  trades?: Trade[]
  bonuses?: Bonus[]
  paymentResourceProviders?: CardProvidedPaymentResourceProvider[]
}

const appendConstructCostAdjustments = (
  cost: ComplexCost,
  adjustments?: ConstructCostAdjustments,
): ComplexCost => {
  const trades = adjustments?.trades ?? []
  const bonuses = adjustments?.bonuses ?? []
  const paymentResourceProviders = adjustments?.paymentResourceProviders ?? []
  if (trades.length === 0 && bonuses.length === 0 && paymentResourceProviders.length === 0) {
    return cost
  }
  return {
    ...cost,
    trades: trades.length > 0 ? [...(cost.trades ?? []), ...trades] : cost.trades,
    bonuses: bonuses.length > 0 ? [...(cost.bonuses ?? []), ...bonuses] : cost.bonuses,
    paymentResourceProviders: paymentResourceProviders.length > 0
      ? [...(cost.paymentResourceProviders ?? []), ...paymentResourceProviders]
      : cost.paymentResourceProviders,
  }
}

export const buildConstructCost = (
  player: PlayerState,
  costs: Partial<Resource> | undefined,
  nb: number,
  actionContext?: Record<string, unknown>,
  adjustments?: ConstructCostAdjustments,
): ComplexCost | null => {
  const costDelta = readConstructCostDelta(actionContext, costs)
  const unitFee = resolveConstructUnitFee(
    player,
    costDelta,
    readExactCost(actionContext),
    nb,
  )
  if (unitFee === null) return null
  return appendConstructCostAdjustments({ unitFee, nb }, adjustments)
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
  adjustments?: ConstructCostAdjustments,
): number => {
  const argMax = typeof actionContext?.maxRooms === 'number'
    ? Math.max(0, Math.floor(actionContext.maxRooms))
    : 99
  const structuralMax = Math.min(countAvailableRoomTiles(player), argMax)
  for (let nb = 1; nb <= structuralMax; nb += 1) {
    const cost = buildConstructCost(player, costs, nb, actionContext, adjustments)
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
  adjustments?: ConstructCostAdjustments,
): RoomPaymentSelectionResult => {
  const cost = buildConstructCost(player, costs, nb, actionContext, adjustments)
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

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
  ComplexCost,
  PaymentSolution,
  PlayerState,
  Resource,
} from '../../../contract/types'
import { getAllTilePositions, positionKey } from '../../../domain/farm'
import { resolveCostPaymentSelection } from './payment-choice-result'
import { executeResolvedTypedFlatPayment } from './typed-flat'
import { applyCostOverride } from './affordability'
import { canPayCost } from './enumerate'

export const getBuildRoomCost = (houseType: PlayerState['houseType']) => {
  if (houseType === 'clay') return { clay: 5, reed: 2 }
  if (houseType === 'stone') return { stone: 5, reed: 2 }
  return { wood: 5, reed: 2 }
}

const buildConstructCost = (
  player: PlayerState,
  costOverride: Partial<Resource> | undefined,
  nb: number,
): ComplexCost => {
  const unitFee = applyCostOverride(getBuildRoomCost(player.houseType), costOverride)
  return { unitFee, nb }
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
  costOverride?: Partial<Resource>,
  actionContext?: Record<string, unknown>,
): number => {
  const argMax = typeof actionContext?.maxRooms === 'number'
    ? Math.max(0, Math.floor(actionContext.maxRooms))
    : 99
  const structuralMax = Math.min(countAvailableRoomTiles(player), argMax)
  for (let nb = 1; nb <= structuralMax; nb += 1) {
    const cost = buildConstructCost(player, costOverride, nb)
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
  costOverride: Partial<Resource> | undefined,
  nb: number,
  paymentChoice?: string,
): RoomPaymentSelectionResult => {
  const cost = buildConstructCost(player, costOverride, nb)
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

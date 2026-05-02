import type { ComplexCost, FarmTilePosition, GameState, PlayerState, Resource } from '../../game/types.ts'
import { applyCostOverride, isComplexCost } from '../../actions/helpers/payment'
import {
  PAYMENT_CHOICE_REQUIRED_ERROR,
  executeResolvedTypedFlatPayment,
  resolveTypedFlatPaymentSelection,
} from '../../actions/helpers/pay-helpers.ts'
import {
  buildRoomCostPerUnit,
  buildTotalRoomCost,
  executeResolvedRoomPayment,
  getMaxBuildableRooms,
  resolveRoomPaymentSelection,
} from '../../actions/helpers/room-payment.ts'
import { stableWoodCost } from '../../actions/effects/fencing.ts'
import { playerCanBuildPalisades } from '../../cards/helpers/card-type'
import {
  normalizePlayerFarm,
  type PlayerFarmState,
  validateFenceSelection,
} from './fence-validation.ts'
import { validateRoomSelection, validateStableSelection } from './validators.ts'
import { validatePlowSelection } from './plow-validation.ts'
import { validateSowSelection, type SowSelection } from './sow-validation.ts'
import {
  consumePendingFenceBonus,
  readPendingFenceBonus,
} from '../../cards/helpers/pending-fence-bonus.ts'
import { collectFenceDiscount, collectLockedFarmTileKeys } from '../../cards/card-effects.ts'

export type FarmChoiceType = 'fence' | 'room' | 'stable' | 'plow' | 'sow'

export type FarmChoicePayloadMap = {
  fence: { edges: string[]; palisadeEdges?: string[]; extraWood?: number }
  room: { rooms: FarmTilePosition[] }
  stable: { stables: FarmTilePosition[] }
  plow: { tile: FarmTilePosition }
  sow: { crops: SowSelection[] }
}

type FarmChoiceOptions = {
  costOverride?: Partial<Resource>
  maxUnits?: number
  paymentChoice?: string
  state?: GameState
  sowOptions?: {
    maxSelections?: number
    excludedFields?: FarmTilePosition[]
    extraAllowedCrops?: Map<string, SowSelection['crop'][]>
  }
}

export type FarmChoiceApplyResult<T extends PlayerState = PlayerState> =
  | {
      ok: true
      player: T
      meta?: {
        usedFreeFences?: number
        sourceCard?: string
        newFenceEdges?: string[]
        newPalisadeEdges?: string[]
        newPastures?: T['pastures']
      }
    }
  | { ok: false; error: string }

const sanitizePayableCost = (
  cost: Partial<Resource> | undefined,
): Partial<Resource> => {
  const payable: Partial<Resource> = {}
  Object.entries(cost ?? {}).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    payable[key as keyof Resource] = value
  })
  return payable
}

const scaleCost = (
  costPerUnit: Partial<Resource>,
  count: number,
): Partial<Resource> => {
  const total: Partial<Resource> = {}
  Object.entries(costPerUnit).forEach(([key, value]) => {
    if (typeof value !== 'number') return
    total[key as keyof Resource] = value * count
  })
  return sanitizePayableCost(total)
}

const getInsufficientResourceError = (
  player: PlayerFarmState,
  cost: Partial<Resource>,
) => {
  const missing = Object.entries(cost).find(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return false
    return (player.resources[key as keyof Resource] ?? 0) < value
  })
  return missing ? `Not enough ${missing[0]}` : 'Not enough resources'
}

const getComplexCostError = (
  player: PlayerFarmState,
  cost: ComplexCost,
) => {
  const firstFee = cost.fees?.[0] ?? cost.fee
  return firstFee ? getInsufficientResourceError(player, firstFee) : 'Not enough resources'
}

export const applyFarmChoice = <T extends PlayerState>(
  player: T,
  farmType: FarmChoiceType,
  payload: FarmChoicePayloadMap[FarmChoiceType],
  options: FarmChoiceOptions = {},
): FarmChoiceApplyResult<T> => {
  const normalized = normalizePlayerFarm(player)
  const lockedKeys = collectLockedFarmTileKeys(player)

  switch (farmType) {
    case 'fence': {
      const { edges, palisadeEdges = [], extraWood } = payload as FarmChoicePayloadMap['fence']
      const freeFences = readPendingFenceBonus(normalized)?.freeFences ?? 0
      const woodDiscount = Math.max(0, Math.abs(options.costOverride?.wood ?? 0))
      const adjustedExtraWood = Math.max(0, (extraWood ?? 0) - woodDiscount)
      const existingEdgeIds = new Set(
        (normalized.fenceSegments ?? []).map((seg) => seg.edge),
      )
      const newFenceEdgesPreview = edges.filter((e) => !existingEdgeIds.has(e))
      const newPalisadeEdgesPreview = palisadeEdges.filter(
        (e) => !existingEdgeIds.has(e),
      )
      const bonusFreeFences = options.state
        ? collectFenceDiscount(options.state, normalized, {
            newFenceEdges: newFenceEdgesPreview,
            newPalisadeEdges: newPalisadeEdgesPreview,
          })
        : 0
      const totalFreeFences = freeFences + bonusFreeFences
      const validated = validateFenceSelection(
        normalized,
        edges,
        palisadeEdges,
        adjustedExtraWood,
        totalFreeFences,
        {
          skipPayment: true,
          allowPalisades: playerCanBuildPalisades(normalized),
        },
        lockedKeys,
      )
      if (!validated.ok) {
        return { ok: false, error: validated.error?.code ?? 'validation failed' }
      }
      const resolvedPayment = resolveTypedFlatPaymentSelection(
        validated.player,
        { wood: validated.payableWoodCost },
        'pay:fence',
        options.paymentChoice,
        { type: 'fail', logKey: 'log.fencingFail' },
        'fencing',
      )
      if (resolvedPayment.type !== 'selected') {
        if (resolvedPayment.type === 'choice') {
          return { ok: false, error: PAYMENT_CHOICE_REQUIRED_ERROR }
        }
        if (options.paymentChoice) {
          return { ok: false, error: 'invalid payment choice' }
        }
        return { ok: false, error: getInsufficientResourceError(normalized, { wood: validated.payableWoodCost }) }
      }
      const nextPlayer = JSON.parse(JSON.stringify(validated.player)) as PlayerState
      executeResolvedTypedFlatPayment(nextPlayer, resolvedPayment, 'fencing')
      const consumed = consumePendingFenceBonus(
        nextPlayer,
        validated.newFenceEdges.length,
      )
      return {
        ok: true,
        player: nextPlayer as unknown as T,
        meta: {
          ...(consumed
            ? { usedFreeFences: consumed.usedFreeFences, sourceCard: consumed.sourceCard }
            : {}),
          newFenceEdges: validated.newFenceEdges,
          newPalisadeEdges: validated.newPalisadeEdges,
          newPastures: validated.newPastures as T['pastures'],
        },
      }
    }
    case 'room': {
      const { rooms } = payload as FarmChoicePayloadMap['room']
      const selection = validateRoomSelection(normalized, rooms, lockedKeys)
      if (!selection.ok) return { ok: false, error: selection.code }
      const maxBuildableRooms = getMaxBuildableRooms(
        normalized,
        options.costOverride,
        typeof options.maxUnits === 'number'
          ? { maxRooms: options.maxUnits }
          : undefined,
      )
      if (rooms.length > maxBuildableRooms) {
        return { ok: false, error: 'too many rooms selected' }
      }
      const costPerRoom = buildRoomCostPerUnit(
        normalized,
        options.costOverride,
      )
      const resolvedPayment = resolveRoomPaymentSelection(
        normalized,
        costPerRoom,
        rooms.length,
        options.paymentChoice,
      )
      if (resolvedPayment.type !== 'selected') {
        if (resolvedPayment.type === 'choice') {
          return { ok: false, error: PAYMENT_CHOICE_REQUIRED_ERROR }
        }
        const totalCost = buildTotalRoomCost(costPerRoom, rooms.length)
        if (options.paymentChoice) {
          return { ok: false, error: 'invalid payment choice' }
        }
        return {
          ok: false,
          error: isComplexCost(totalCost)
            ? getComplexCostError(normalized, totalCost)
            : getInsufficientResourceError(normalized, totalCost),
        }
      }
      const nextPlayer = JSON.parse(JSON.stringify(normalized)) as PlayerState
      executeResolvedRoomPayment(nextPlayer, resolvedPayment)
      return {
        ok: true,
        player: {
          ...(nextPlayer as unknown as T),
          roomTiles: [...nextPlayer.roomTiles, ...rooms],
          rooms: nextPlayer.rooms + rooms.length,
        } as T,
      }
    }
    case 'stable': {
      const { stables } = payload as FarmChoicePayloadMap['stable']
      const selection = validateStableSelection(normalized, stables, lockedKeys)
      if (!selection.ok) return { ok: false, error: selection.code }
      const costPerStable = applyCostOverride(
        { wood: stableWoodCost },
        options.costOverride,
      )
      const totalCost = scaleCost(costPerStable, stables.length)
      const resolvedPayment = resolveTypedFlatPaymentSelection(
        normalized,
        totalCost,
        'pay:stable',
        options.paymentChoice,
        { type: 'fail', logKey: 'log.buildStableFail' },
        'stables',
      )
      if (resolvedPayment.type !== 'selected') {
        if (resolvedPayment.type === 'choice') {
          return { ok: false, error: PAYMENT_CHOICE_REQUIRED_ERROR }
        }
        if (options.paymentChoice) {
          return { ok: false, error: 'invalid payment choice' }
        }
        return { ok: false, error: getInsufficientResourceError(normalized, totalCost) }
      }
      const nextPlayer = JSON.parse(JSON.stringify(normalized)) as PlayerState
      executeResolvedTypedFlatPayment(nextPlayer, resolvedPayment, 'stables')
      return {
        ok: true,
        player: {
          ...(nextPlayer as unknown as T),
          stableTiles: [...nextPlayer.stableTiles, ...stables],
        } as T,
      }
    }
    case 'plow': {
      const { tile } = payload as FarmChoicePayloadMap['plow']
      const result = validatePlowSelection(normalized, tile, lockedKeys)
      if (!result.ok) return { ok: false, error: result.error?.code ?? 'validation failed' }
      const plowCost = sanitizePayableCost(options.costOverride)
      const resolvedPayment = resolveTypedFlatPaymentSelection(
        result.player,
        plowCost,
        'pay:plow',
        options.paymentChoice,
        { type: 'fail', logKey: 'log.action' },
        'plow',
      )
      if (resolvedPayment.type !== 'selected') {
        if (resolvedPayment.type === 'choice') {
          return { ok: false, error: PAYMENT_CHOICE_REQUIRED_ERROR }
        }
        if (options.paymentChoice) {
          return { ok: false, error: 'invalid payment choice' }
        }
        return { ok: false, error: getInsufficientResourceError(result.player, plowCost) }
      }
      const nextPlayer = JSON.parse(JSON.stringify(result.player)) as PlayerState
      executeResolvedTypedFlatPayment(nextPlayer, resolvedPayment, 'plow')
      return { ok: true, player: nextPlayer as unknown as T }
    }
    case 'sow': {
      const { crops } = payload as FarmChoicePayloadMap['sow']
      const result = validateSowSelection(normalized, crops, options.sowOptions)
      return result.ok
        ? { ok: true, player: result.player as T }
        : { ok: false, error: result.error?.code ?? 'validation failed' }
    }
  }
}

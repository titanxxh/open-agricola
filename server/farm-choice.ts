import type { FarmTilePosition, Resource } from '../shared/game/types.ts'
import { getBuildRoomCost } from '../shared/actions/effects/construct.ts'
import { applyCostOverride, canPayResources } from '../shared/actions/effects/pay.ts'
import { stableWoodCost } from '../shared/actions/effects/fencing.ts'
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
} from '../shared/cards/helpers/pending-fence-bonus.ts'

export type FarmChoiceType = 'fence' | 'room' | 'stable' | 'plow' | 'sow'

type FarmChoicePayloadMap = {
  fence: { edges: string[]; extraWood?: number }
  room: { rooms: FarmTilePosition[] }
  stable: { stables: FarmTilePosition[] }
  plow: { tile: FarmTilePosition }
  sow: { crops: SowSelection[] }
}

type FarmChoiceOptions = {
  costOverride?: Partial<Resource>
  roomCostPerUnit?: Partial<Resource>
}

export type FarmChoiceApplyResult<T extends PlayerFarmState = PlayerFarmState> =
  | { ok: true; player: T; meta?: { usedFreeFences?: number; sourceCard?: string } }
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

const payResourceCost = <T extends PlayerFarmState>(
  player: T,
  cost: Partial<Resource>,
): T => {
  const nextResources = { ...player.resources }
  Object.entries(cost).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    nextResources[key as keyof Resource] =
      (nextResources[key as keyof Resource] ?? 0) - value
  })
  return {
    ...player,
    resources: nextResources,
  }
}

export const applyFarmChoice = <T extends PlayerFarmState>(
  player: T,
  farmType: FarmChoiceType,
  payload: FarmChoicePayloadMap[FarmChoiceType],
  options: FarmChoiceOptions = {},
): FarmChoiceApplyResult<T> => {
  const normalized = normalizePlayerFarm(player)

  switch (farmType) {
    case 'fence': {
      const { edges, extraWood } = payload as FarmChoicePayloadMap['fence']
      const freeFences = readPendingFenceBonus(normalized as unknown as PlayerState)?.freeFences ?? 0
      const woodDiscount = Math.max(0, Math.abs(options.costOverride?.wood ?? 0))
      const adjustedExtraWood = Math.max(0, (extraWood ?? 0) - woodDiscount)
      const result = validateFenceSelection(normalized, edges, adjustedExtraWood, freeFences)
      if (!result.ok) {
        return { ok: false, error: result.error?.code ?? 'validation failed' }
      }
      const consumed = consumePendingFenceBonus(
        result.player as unknown as PlayerState,
        result.newEdges.length,
      )
      return {
        ok: true,
        player: result.player as T,
        meta: consumed ? { usedFreeFences: consumed.usedFreeFences, sourceCard: consumed.sourceCard } : undefined,
      }
    }
    case 'room': {
      const { rooms } = payload as FarmChoicePayloadMap['room']
      const selection = validateRoomSelection(normalized, rooms)
      if (!selection.ok) return { ok: false, error: selection.code }
      const costPerRoom = options.roomCostPerUnit ??
        applyCostOverride(
          getBuildRoomCost(normalized.houseType),
          options.costOverride,
        )
      const totalCost = scaleCost(costPerRoom, rooms.length)
      if (!canPayResources(normalized as any, totalCost)) {
        return { ok: false, error: getInsufficientResourceError(normalized, totalCost) }
      }
      const updated = payResourceCost(normalized, totalCost)
      return {
        ok: true,
        player: {
          ...updated,
          roomTiles: [...updated.roomTiles, ...rooms],
          rooms: updated.rooms + rooms.length,
        } as T,
      }
    }
    case 'stable': {
      const { stables } = payload as FarmChoicePayloadMap['stable']
      const selection = validateStableSelection(normalized, stables)
      if (!selection.ok) return { ok: false, error: selection.code }
      const costPerStable = applyCostOverride(
        { wood: stableWoodCost },
        options.costOverride,
      )
      const totalCost = scaleCost(costPerStable, stables.length)
      if (!canPayResources(normalized as any, totalCost)) {
        return { ok: false, error: getInsufficientResourceError(normalized, totalCost) }
      }
      const updated = payResourceCost(normalized, totalCost)
      return {
        ok: true,
        player: {
          ...updated,
          stableTiles: [...updated.stableTiles, ...stables],
        } as T,
      }
    }
    case 'plow': {
      const { tile } = payload as FarmChoicePayloadMap['plow']
      const result = validatePlowSelection(normalized, tile)
      if (!result.ok) return { ok: false, error: result.error?.code ?? 'validation failed' }
      const plowCost = sanitizePayableCost(options.costOverride)
      if (!canPayResources(result.player as any, plowCost)) {
        return { ok: false, error: getInsufficientResourceError(result.player, plowCost) }
      }
      return { ok: true, player: payResourceCost(result.player, plowCost) as T }
    }
    case 'sow': {
      const { crops } = payload as FarmChoicePayloadMap['sow']
      const result = validateSowSelection(normalized, crops)
      return result.ok
        ? { ok: true, player: result.player as T }
        : { ok: false, error: result.error?.code ?? 'validation failed' }
    }
  }
}

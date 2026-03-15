import type {
  InteractionFarmSelection,
  PendingAction,
  PlayerState,
  Resource,
} from '../shared/game/types.ts'
import { getBuildRoomCost } from '../shared/actions/effects/construct.ts'
import { applyCostOverride, canPayResources } from '../shared/actions/effects/pay.ts'
import { stableWoodCost } from '../shared/actions/effects/fencing.ts'
import { getAllTilePositions, positionKey } from '../shared/game/farm.ts'
import { normalizePlayerFarm, getAllEdgeIds } from './fence-validation.ts'
import { validatePlowSelection } from './plow-validation.ts'

const sanitizePayableCost = (
  costOverride?: Partial<Resource>,
): Partial<Resource> => {
  const payable: Partial<Resource> = {}
  Object.entries(costOverride ?? {}).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    payable[key as keyof Resource] = value
  })
  return payable
}

export const buildRoomFarmInteraction = (
  player: PlayerState,
  costOverride?: Partial<Resource>,
): InteractionFarmSelection => {
  const normalized = normalizePlayerFarm(player as Parameters<typeof normalizePlayerFarm>[0])
  const occupied = new Set(normalized.roomTiles.map(positionKey))
  normalized.fields.forEach((field) => occupied.add(positionKey(field)))
  normalized.stableTiles.forEach((tile) => occupied.add(positionKey(tile)))
  normalized.pastures.flatMap((pasture) => pasture.tiles).forEach((tile) => occupied.add(positionKey(tile)))
  const selectableTiles = getAllTilePositions().filter((tile) => !occupied.has(positionKey(tile)))
  const costPerRoom = applyCostOverride(getBuildRoomCost(player.houseType), costOverride)
  const resourceMax = Object.entries(costPerRoom).reduce((max, [key, value]) => {
    if (typeof value !== 'number' || value <= 0) return max
    const available = player.resources[key as keyof Resource] ?? 0
    return Math.min(max, Math.floor(available / value))
  }, Number.POSITIVE_INFINITY)
  const maxSelections = Math.min(
    selectableTiles.length,
    Number.isFinite(resourceMax) ? resourceMax : selectableTiles.length,
  )
  return {
    farmType: 'room',
    selectableTiles,
    maxSelections: Math.max(0, maxSelections),
    costPerRoom,
  }
}

export const buildStableFarmInteraction = (
  player: PlayerState,
  costOverride?: Partial<Resource>,
): InteractionFarmSelection => {
  const normalized = normalizePlayerFarm(player as Parameters<typeof normalizePlayerFarm>[0])
  const occupied = new Set(normalized.roomTiles.map(positionKey))
  normalized.fields.forEach((field) => occupied.add(positionKey(field)))
  normalized.stableTiles.forEach((tile) => occupied.add(positionKey(tile)))
  const selectableTiles = getAllTilePositions().filter((tile) => !occupied.has(positionKey(tile)))
  const costPerStable = applyCostOverride({ wood: stableWoodCost }, costOverride)
  const payableCost = sanitizePayableCost(costPerStable)
  const maxByCost =
    Object.keys(payableCost).length === 0
      ? Math.max(0, 4 - normalized.stableTiles.length)
      : Object.entries(payableCost).reduce((max, [key, value]) => {
          if (typeof value !== 'number' || value <= 0) return max
          const available = player.resources[key as keyof Resource] ?? 0
          return Math.min(max, Math.floor(available / value))
        }, Number.POSITIVE_INFINITY)
  const maxSelections = Math.min(
    Math.max(0, 4 - normalized.stableTiles.length),
    Number.isFinite(maxByCost) ? maxByCost : Math.max(0, 4 - normalized.stableTiles.length),
  )
  return {
    farmType: 'stable',
    selectableTiles,
    maxSelections,
  }
}

export const buildPlowFarmInteraction = (
  player: PlayerState,
  costOverride?: Partial<Resource>,
): InteractionFarmSelection => {
  const normalized = normalizePlayerFarm(player as Parameters<typeof normalizePlayerFarm>[0])
  const payableCost = sanitizePayableCost(costOverride)
  const canAffordPlow = canPayResources(normalized as PlayerState, payableCost)
  const selectableTiles = canAffordPlow
    ? getAllTilePositions().filter(
        (tile) => validatePlowSelection(normalized, tile).ok,
      )
    : []
  return { farmType: 'plow', selectableTiles }
}

export const buildSowFarmInteraction = (
  player: PlayerState,
): InteractionFarmSelection => {
  const normalized = normalizePlayerFarm(player as Parameters<typeof normalizePlayerFarm>[0])
  const selectableFields = normalized.fields.flatMap((field) => {
    if (field.crop !== null) return []
    const allowedCrops: ('grain' | 'vegetable')[] = []
    if ((normalized.resources.grain ?? 0) > 0) {
      allowedCrops.push('grain')
    }
    if ((normalized.resources.vegetable ?? 0) > 0) {
      allowedCrops.push('vegetable')
    }
    if (allowedCrops.length === 0) return []
    return [{ tile: { row: field.row, col: field.col }, allowedCrops }]
  })
  return { farmType: 'sow', selectableFields }
}

export const buildFenceFarmInteraction = (
  player: PlayerState,
  pending: Extract<PendingAction, { type: 'choice' }>,
): InteractionFarmSelection => {
  const normalized = normalizePlayerFarm(player as Parameters<typeof normalizePlayerFarm>[0])
  const existing = new Set(normalized.fenceSegments ?? [])
  const selectableEdges = getAllEdgeIds().filter((edgeId) => !existing.has(edgeId))
  const extraWood = pending.spaceId === 'farm-redevelopment' ? 1 : 0
  return {
    farmType: 'fence',
    selectableEdges,
    extraWood,
  }
}

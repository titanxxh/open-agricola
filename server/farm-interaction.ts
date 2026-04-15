import type {
  FarmTilePosition,
  InteractionFarmSelection,
  PendingAction,
  PlayerState,
  Resource,
} from '../shared/game/types.ts'
import { applyCostOverride } from '../shared/actions/effects/pay.ts'
import { canAffordTypedFlatCost } from '../shared/actions/effects/pay-helpers.ts'
import { getMaxBuildableRooms } from '../shared/actions/effects/room-payment.ts'
import { stableWoodCost } from '../shared/actions/effects/fencing.ts'
import { getAllTilePositions, positionKey } from '../shared/game/farm.ts'
import { normalizePlayerFarm, getAllEdgeIds } from './fence-validation.ts'
import { validatePlowSelection } from './plow-validation.ts'
import { computeExtraSowableFields } from '../shared/cards/card-effects.ts'

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

export const buildRoomFarmInteraction = (
  player: PlayerState,
  costOverride?: Partial<Resource>,
  actionContext?: Record<string, unknown>,
): InteractionFarmSelection => {
  const normalized = normalizePlayerFarm(player)
  const occupied = new Set(normalized.roomTiles.map(positionKey))
  normalized.fields.forEach((field) => occupied.add(positionKey(field)))
  normalized.stableTiles.forEach((tile) => occupied.add(positionKey(tile)))
  normalized.pastures.flatMap((pasture) => pasture.tiles).forEach((tile) => occupied.add(positionKey(tile)))
  const selectableTiles = getAllTilePositions().filter((tile) => !occupied.has(positionKey(tile)))
  const maxSelections = Math.min(
    selectableTiles.length,
    getMaxBuildableRooms(player, costOverride, actionContext),
  )
  return {
    farmType: 'room',
    selectableTiles,
    maxSelections: Math.max(0, maxSelections),
  }
}

export const buildStableFarmInteraction = (
  player: PlayerState,
  costOverride?: Partial<Resource>,
): InteractionFarmSelection => {
  const normalized = normalizePlayerFarm(player)
  const occupied = new Set(normalized.roomTiles.map(positionKey))
  normalized.fields.forEach((field) => occupied.add(positionKey(field)))
  normalized.stableTiles.forEach((tile) => occupied.add(positionKey(tile)))
  const selectableTiles = getAllTilePositions().filter((tile) => !occupied.has(positionKey(tile)))
  const costPerStable = applyCostOverride({ wood: stableWoodCost }, costOverride)
  const structuralMax = Math.min(
    selectableTiles.length,
    Math.max(0, 4 - normalized.stableTiles.length),
  )
  let resourceMax = 0
  for (let count = 1; count <= structuralMax; count += 1) {
    if (!canAffordTypedFlatCost(player, scaleCost(costPerStable, count), 'stables')) break
    resourceMax = count
  }
  return {
    farmType: 'stable',
    selectableTiles,
    maxSelections: resourceMax,
  }
}

export const buildPlowFarmInteraction = (
  player: PlayerState,
  costOverride?: Partial<Resource>,
): InteractionFarmSelection => {
  const normalized = normalizePlayerFarm(player)
  const payableCost = sanitizePayableCost(costOverride)
  const canAffordPlow = canAffordTypedFlatCost(normalized as PlayerState, payableCost, 'plow')
  const selectableTiles = canAffordPlow
    ? getAllTilePositions().filter(
        (tile) => validatePlowSelection(normalized, tile).ok,
      )
    : []
  return { farmType: 'plow', selectableTiles }
}

export const buildSowFarmInteraction = (
  player: PlayerState,
  actionContext?: Record<string, unknown>,
): InteractionFarmSelection => {
  const normalized = normalizePlayerFarm(player)
  const excludedKeys = new Set(
    Array.isArray(actionContext?.excludedFields)
      ? actionContext.excludedFields.flatMap((field) => {
        const row = Number((field as { row?: unknown }).row)
        const col = Number((field as { col?: unknown }).col)
        if (!Number.isFinite(row) || !Number.isFinite(col)) return []
        return [positionKey({ row, col })]
      })
      : [],
  )
  const selectableFields = normalized.fields.flatMap((field) => {
    if (field.crop !== null) return []
    if (excludedKeys.has(positionKey({ row: field.row, col: field.col }))) return []
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
  // Add extra sowable fields from card effects (e.g. B72 pastures)
  const extraFields = computeExtraSowableFields(player)
  for (const extra of extraFields) {
    const key = positionKey(extra.tile)
    if (excludedKeys.has(key)) continue
    // Filter allowed crops by what the player actually has
    const filteredCrops = extra.allowedCrops.filter((crop) => {
      if (crop === 'grain') return (normalized.resources.grain ?? 0) > 0
      if (crop === 'vegetable') return (normalized.resources.vegetable ?? 0) > 0
      return false
    })
    if (filteredCrops.length === 0) continue
    selectableFields.push({ tile: extra.tile, allowedCrops: filteredCrops })
  }

  const rawMaxSelections = typeof actionContext?.maxSelections === 'number'
    ? Math.max(0, Math.floor(actionContext.maxSelections))
    : undefined
  const maxSelections = rawMaxSelections === undefined
    ? undefined
    : Math.min(rawMaxSelections, selectableFields.length)
  return { farmType: 'sow', selectableFields, maxSelections }
}

export const buildFieldSelectFarmInteraction = (
  player: PlayerState,
  actionContext?: Record<string, unknown>,
): InteractionFarmSelection => {
  const filter = actionContext?.fieldFilter as string | undefined
  const maxSelections = (actionContext?.maxSelections as number) ?? 1
  const minSelections = (actionContext?.minSelections as number) ?? 0
  const selectableFields: FarmTilePosition[] = player.fields
    .filter((f) => {
      if (filter === 'has-vegetable') return f.crop === 'vegetable' && f.remaining > 0
      if (filter === 'has-grain') return f.crop === 'grain' && f.remaining > 0
      if (filter === 'has-crop') return f.crop !== null && f.remaining > 0
      if (filter === 'has-exactly-1-crop') return f.crop !== null && f.remaining === 1
      if (filter === 'empty') return f.crop === null
      return f.crop !== null && f.remaining > 0
    })
    .map((f) => ({ row: f.row, col: f.col }))
  return { farmType: 'field-select', selectableFields, maxSelections, minSelections }
}

export const buildFenceFarmInteraction = (
  player: PlayerState,
  pending: Extract<PendingAction, { type: 'choice' }>,
): InteractionFarmSelection => {
  const normalized = normalizePlayerFarm(player)
  const existing = new Set(normalized.fenceSegments ?? [])
  const selectableEdges = getAllEdgeIds().filter((edgeId) => !existing.has(edgeId))
  const extraWood = pending.spaceId === 'farm-redevelopment' ? 1 : 0
  return {
    farmType: 'fence',
    selectableEdges,
    extraWood,
  }
}

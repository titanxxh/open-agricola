import type {
  FarmTilePosition,
  InteractionFarmSelection,
  InteractionSelection,
  PlayerState,
  Resource,
} from '../../game/types.ts'
import { applyCostOverride } from '../../actions/helpers/payment'
import { canAffordTypedFlatCost } from '../../actions/helpers/pay-helpers.ts'
import { getMaxBuildableRooms } from '../../actions/helpers/room-payment.ts'
import { readCardExtraData } from '../../cards/helpers/card-state.ts'
import { stableWoodCost } from '../../actions/effects/fencing.ts'
import { getAllTilePositions, positionKey } from '../../game/farm.ts'
import { normalizePlayerFarm, getAllEdgeIds } from './fence-validation.ts'
import { validatePlowSelection } from './plow-validation.ts'
import { computeExtraSowableFields, collectLockedFarmTileKeys } from '../../cards/card-effects.ts'

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

const roomNeighbors = (tile: FarmTilePosition) => [
  { row: tile.row - 1, col: tile.col },
  { row: tile.row + 1, col: tile.col },
  { row: tile.row, col: tile.col - 1 },
  { row: tile.row, col: tile.col + 1 },
]

const getReachableRoomTiles = (
  player: PlayerState,
  candidateTiles: FarmTilePosition[],
  maxSelections: number,
) => {
  if (maxSelections <= 0) return []
  const candidateByKey = new Map(
    candidateTiles.map((tile) => [positionKey(tile), tile] as const),
  )
  const visited = new Set(player.roomTiles.map(positionKey))
  const reachable = new Set<string>()
  let frontier = [...player.roomTiles]

  for (let depth = 0; depth < maxSelections; depth += 1) {
    const nextFrontier: FarmTilePosition[] = []
    frontier.forEach((tile) => {
      roomNeighbors(tile).forEach((neighbor) => {
        const key = positionKey(neighbor)
        if (visited.has(key) || !candidateByKey.has(key)) return
        visited.add(key)
        reachable.add(key)
        nextFrontier.push(candidateByKey.get(key)!)
      })
    })
    frontier = nextFrontier
    if (frontier.length === 0) break
  }

  return candidateTiles.filter((tile) => reachable.has(positionKey(tile)))
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
  const lockedKeys = collectLockedFarmTileKeys(player)
  const selectableTiles = getAllTilePositions().filter((tile) => {
    const key = positionKey(tile)
    return !occupied.has(key) && !lockedKeys.has(key)
  })
  const maxSelections = Math.min(
    selectableTiles.length,
    getMaxBuildableRooms(player, costOverride, actionContext),
  )
  const reachableTiles = getReachableRoomTiles(
    normalized,
    selectableTiles,
    maxSelections,
  )
  return {
    farmType: 'room',
    selectableTiles: reachableTiles,
    maxSelections: Math.min(reachableTiles.length, Math.max(0, maxSelections)),
  }
}

export const buildStableFarmInteraction = (
  player: PlayerState,
  costOverride?: Partial<Resource>,
  options?: {
    /**
     * Restrict selectable tiles to a sub-zone of the farm. Currently supports
     * `'pasture-1'` — only tiles inside size=1 pastures (used by A1 Shelter).
     */
    zoneFilter?: 'pasture-1'
    /**
     * Hard-cap how many stables can be placed in this interaction (overrides
     * the structural 4-stable cap if smaller). Used by A1 Shelter (max=1).
     */
    max?: number
  },
): InteractionFarmSelection => {
  const normalized = normalizePlayerFarm(player)
  const occupied = new Set(normalized.roomTiles.map(positionKey))
  normalized.fields.forEach((field) => occupied.add(positionKey(field)))
  normalized.stableTiles.forEach((tile) => occupied.add(positionKey(tile)))
  const lockedKeys = collectLockedFarmTileKeys(player)
  let selectableTiles = getAllTilePositions().filter((tile) => {
    const key = positionKey(tile)
    return !occupied.has(key) && !lockedKeys.has(key)
  })
  if (options?.zoneFilter === 'pasture-1') {
    const oneSizePastureCells = new Set<string>()
    for (const pasture of player.pastures) {
      if (pasture.size === 1) {
        for (const cell of pasture.tiles ?? []) {
          oneSizePastureCells.add(positionKey(cell))
        }
      }
    }
    selectableTiles = selectableTiles.filter((tile) =>
      oneSizePastureCells.has(positionKey(tile)),
    )
  }
  const costPerStable = applyCostOverride({ wood: stableWoodCost }, costOverride)
  const structuralMax = Math.min(
    selectableTiles.length,
    Math.max(0, 4 - normalized.stableTiles.length),
    options?.max ?? Number.POSITIVE_INFINITY,
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
  const lockedKeys = collectLockedFarmTileKeys(player)
  const selectableTiles = canAffordPlow
    ? getAllTilePositions().filter(
        (tile) => validatePlowSelection(normalized, tile, lockedKeys).ok,
      )
    : []
  return { farmType: 'plow', selectableTiles }
}

export const buildSowFarmInteraction = (
  player: PlayerState,
  actionContext?: Record<string, unknown>,
): InteractionFarmSelection => {
  const normalized = normalizePlayerFarm(player)
  const excludedKeys = getExcludedFieldKeys(actionContext)
  const allowedKeys = getAllowedSelectedFieldKeys(player, actionContext)

  const selectableFields: {
    tile: FarmTilePosition
    allowedCrops: ('grain' | 'vegetable' | 'wood')[]
    sourceCard?: string
  }[] = normalized.fields.flatMap((field) => {
    if (field.stacks.length !== 0) return []
    const key = positionKey({ row: field.row, col: field.col })
    if (excludedKeys.has(key)) return []
    if (allowedKeys && !allowedKeys.has(key)) return []
    const allowedCrops: ('grain' | 'vegetable' | 'wood')[] = []
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
  const extraFields = getPermittedExtraSowableFields(player, actionContext)
  for (const extra of extraFields) {
    // Filter allowed crops by what the player actually has
    const filteredCrops = extra.allowedCrops.filter((crop) => {
      if (crop === 'grain') return (normalized.resources.grain ?? 0) > 0
      if (crop === 'vegetable') return (normalized.resources.vegetable ?? 0) > 0
      if (crop === 'wood') return (normalized.resources.wood ?? 0) > 0
      return false
    })
    if (filteredCrops.length === 0) continue
    selectableFields.push({
      tile: extra.tile,
      allowedCrops: filteredCrops,
      sourceCard: extra.sourceCard,
    })
  }

  const rawMaxSelections = typeof actionContext?.maxSelections === 'number'
    ? Math.max(0, Math.floor(actionContext.maxSelections))
    : undefined
  const maxSelections = rawMaxSelections === undefined
    ? undefined
    : Math.min(rawMaxSelections, selectableFields.length)
  return { farmType: 'sow', selectableFields, maxSelections }
}

const getExcludedFieldKeys = (
  actionContext?: Record<string, unknown>,
) => new Set(
  Array.isArray(actionContext?.excludedFields)
    ? actionContext.excludedFields.flatMap((field) => {
      const row = Number((field as { row?: unknown }).row)
      const col = Number((field as { col?: unknown }).col)
      if (!Number.isFinite(row) || !Number.isFinite(col)) return []
      return [positionKey({ row, col })]
    })
    : [],
)

const getAllowedSelectedFieldKeys = (
  player: PlayerState,
  actionContext?: Record<string, unknown>,
) => actionContext?.allowedFields === 'fromSelectedFields' && typeof actionContext?.sourceCard === 'string'
  ? new Set(readCardExtraData<string[]>(player, actionContext.sourceCard as string, 'selectedPositions') ?? [])
  : null

export const getPermittedExtraSowableFields = (
  player: PlayerState,
  actionContext?: Record<string, unknown>,
) => {
  const excludedKeys = getExcludedFieldKeys(actionContext)
  const allowedKeys = getAllowedSelectedFieldKeys(player, actionContext)
  return computeExtraSowableFields(player).filter((extra) => {
    const key = positionKey(extra.tile)
    if (excludedKeys.has(key)) return false
    if (allowedKeys && !allowedKeys.has(key)) return false
    return true
  })
}

export const buildFarmPositionSelectionInteraction = (
  player: PlayerState,
  actionContext?: Record<string, unknown>,
): InteractionSelection => {
  const selectableTiles = Array.isArray(actionContext?.selectableTiles)
    ? actionContext.selectableTiles
        .flatMap((tile) => {
          const row = Number((tile as { row?: unknown }).row)
          const col = Number((tile as { col?: unknown }).col)
          if (!Number.isFinite(row) || !Number.isFinite(col)) return []
          return [{ row, col }]
        })
    : null
  const filter = actionContext?.positionFilter as string | undefined
  const maxSelections = (actionContext?.maxSelections as number) ?? 1
  const minSelections = (actionContext?.minSelections as number) ?? 0
  const selectablePositions: FarmTilePosition[] = selectableTiles ?? player.fields
    .filter((f) => {
      const top = f.stacks[f.stacks.length - 1]
      if (!filter) return true
      if (filter === 'has-vegetable') return top?.kind === 'vegetable' && top.remaining > 0
      if (filter === 'has-grain') return top?.kind === 'grain' && top.remaining > 0
      if (filter === 'has-crop') return !!top && top.remaining > 0
      if (filter === 'has-exactly-1-crop') return !!top && top.remaining === 1
      if (filter === 'has-2-plus-crops') return !!top && top.remaining >= 2
      if (filter === 'empty-plowed') return f.stacks.length === 0
      if (filter === 'empty') return f.stacks.length === 0
      return !!top && top.remaining > 0
    })
    .map((f) => ({ row: f.row, col: f.col }))

  return {
    kind: 'farm-position',
    selectablePositions,
    maxSelections,
    minSelections,
  }
}

export const buildFenceFarmInteraction = (
  player: PlayerState,
  spaceId: string,
): InteractionFarmSelection => {
  const normalized = normalizePlayerFarm(player)
  const existing = new Set((normalized.fenceSegments ?? []).map((s) => s.edge))
  const selectableEdges = getAllEdgeIds().filter((edgeId) => !existing.has(edgeId))
  const extraWood = spaceId === 'farm-redevelopment' ? 1 : 0
  return {
    farmType: 'fence',
    selectableEdges,
    extraWood,
  }
}

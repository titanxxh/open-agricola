import type {
  ExactCost,
  FarmTilePosition,
  GameState,
  InteractionFarmSelection,
  InteractionSelection,
  PlayerState,
  Resource,
} from '../contract/types.ts'
import { PaymentSolver, type ConstructCostAdjustments } from '../actions/payment'
import { collectLockedFarmTileKeys, computeExtraSowableFields } from '../cards/card-effects.ts'
import { readCardExtraData } from '../cards/helpers/card-state.ts'
import { getFarmyardTilePositions, positionKey } from './farm.ts'
import {
  getAllEdgeIds,
  isBorrowedFenceSourcePolicy,
  normalizePlayerFarm,
  validatePlowSelection,
  type FenceSourcePolicy,
  type SowSelection,
} from './farmyard.ts'
import { getOrdinaryStableCount } from './stables.ts'
import { buildFarmPositionSelectionRequest } from './farm-position-selection.ts'

const STABLE_WOOD_COST = 2
const DEFAULT_NORMAL_FIELD_CROPS = ['grain', 'vegetable'] as const satisfies readonly SowSelection['crop'][]

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
  costAdjustments?: ConstructCostAdjustments,
  state?: GameState,
): InteractionFarmSelection => {
  const normalized = normalizePlayerFarm(player)
  const occupied = new Set(normalized.roomTiles.map(positionKey))
  normalized.farmTerrain?.forEach((tile) => occupied.add(positionKey(tile)))
  normalized.fields.forEach((field) => occupied.add(positionKey(field)))
  normalized.stableTiles.forEach((tile) => occupied.add(positionKey(tile)))
  normalized.pastures
    .flatMap((pasture) => pasture.tiles)
    .forEach((tile) => occupied.add(positionKey(tile)))
  const lockedKeys = collectLockedFarmTileKeys(player)
  const selectableTiles = getFarmyardTilePositions(normalized).filter((tile) => {
    const key = positionKey(tile)
    return !occupied.has(key) && !lockedKeys.has(key)
  })
  const maxSelections = Math.min(
    selectableTiles.length,
    PaymentSolver.getMaxBuildableRooms(player, costOverride, actionContext, costAdjustments, state),
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
    zoneFilter?: 'pasture-1'
    max?: number
    exactCost?: ExactCost
  },
): InteractionFarmSelection => {
  const normalized = normalizePlayerFarm(player)
  const occupied = new Set(normalized.roomTiles.map(positionKey))
  normalized.farmTerrain?.forEach((tile) => occupied.add(positionKey(tile)))
  normalized.fields.forEach((field) => occupied.add(positionKey(field)))
  normalized.stableTiles.forEach((tile) => occupied.add(positionKey(tile)))
  const lockedKeys = collectLockedFarmTileKeys(player)
  let selectableTiles = getFarmyardTilePositions(normalized).filter((tile) => {
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
  const structuralMax = Math.min(
    selectableTiles.length,
    Math.max(0, 4 - getOrdinaryStableCount(player)),
    options?.max ?? Number.POSITIVE_INFINITY,
  )
  const unitCost = PaymentSolver.resolveUnitCostWithDelta(
    { wood: STABLE_WOOD_COST },
    options?.exactCost,
    costOverride,
    1,
  )
  let resourceMax = 0
  for (let count = 1; count <= structuralMax; count += 1) {
    const totalCost = PaymentSolver.resolveUnitCostWithDelta(
      { wood: STABLE_WOOD_COST },
      options?.exactCost,
      costOverride,
      count,
    )
    if (
      !unitCost ||
      !totalCost ||
      !PaymentSolver.canAffordTypedFlatCost(player, { unitFee: unitCost, nb: count }, 'stables')
    ) break
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
  exactCost?: ExactCost,
): InteractionFarmSelection => {
  const normalized = normalizePlayerFarm(player)
  const payableCost = PaymentSolver.resolveUnitCostWithDelta({}, exactCost, costOverride, 1)
  const canAffordPlow =
    payableCost !== null &&
    PaymentSolver.canAffordTypedFlatCost(normalized as PlayerState, payableCost, 'plow')
  const lockedKeys = collectLockedFarmTileKeys(player)
  const selectableTiles = canAffordPlow
    ? getFarmyardTilePositions(normalized).filter(
        (tile) => validatePlowSelection(normalized, tile, lockedKeys).ok,
      )
    : []
  return { farmType: 'plow', selectableTiles }
}

const getExcludedFieldKeys = (actionContext?: Record<string, unknown>) =>
  new Set(
    Array.isArray(actionContext?.excludedFields)
      ? actionContext.excludedFields.flatMap((field) => {
          const row = Number((field as { row?: unknown }).row)
          const col = Number((field as { col?: unknown }).col)
          if (!Number.isFinite(row) || !Number.isFinite(col)) return []
          return [positionKey({ row, col })]
        })
      : [],
  )

export const getAllowedSelectedFieldKeys = (
  player: PlayerState,
  actionContext?: Record<string, unknown>,
) =>
  actionContext?.allowedFields === 'fromSelectedFields' &&
  typeof actionContext?.sourceCard === 'string'
    ? new Set(
        readCardExtraData<string[]>(
          player,
          actionContext.sourceCard as string,
          'selectedPositions',
        ) ?? [],
      )
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

export const buildSowFarmInteraction = (
  player: PlayerState,
  actionContext?: Record<string, unknown>,
): InteractionFarmSelection => {
  const normalized = normalizePlayerFarm(player)
  const excludedKeys = getExcludedFieldKeys(actionContext)
  const allowedKeys = getAllowedSelectedFieldKeys(player, actionContext)
  const ctxCropType =
    typeof actionContext?.cropType === 'string'
      ? (actionContext.cropType as SowSelection['crop'])
      : undefined
  const normalAllowed: readonly SowSelection['crop'][] =
    ctxCropType === 'grain' || ctxCropType === 'vegetable'
      ? [ctxCropType]
      : ctxCropType === 'wood' || ctxCropType === 'stone'
        ? []
        : DEFAULT_NORMAL_FIELD_CROPS

  const selectableFields: {
    tile: FarmTilePosition
    allowedCrops: ('grain' | 'vegetable' | 'wood' | 'stone')[]
    sourceCard?: string
    groupKey?: string
  }[] = normalized.fields.flatMap((field) => {
    if (field.stacks.length !== 0) return []
    const key = positionKey({ row: field.row, col: field.col })
    if (excludedKeys.has(key)) return []
    if (allowedKeys && !allowedKeys.has(key)) return []
    const allowedCrops: ('grain' | 'vegetable' | 'wood' | 'stone')[] = []
    if (normalAllowed.includes('grain') && (normalized.resources.grain ?? 0) > 0) {
      allowedCrops.push('grain')
    }
    if (
      normalAllowed.includes('vegetable') &&
      (normalized.resources.vegetable ?? 0) > 0
    ) {
      allowedCrops.push('vegetable')
    }
    if (allowedCrops.length === 0) return []
    return [{ tile: { row: field.row, col: field.col }, allowedCrops }]
  })
  const extraFields = getPermittedExtraSowableFields(player, actionContext)
  for (const extra of extraFields) {
    const filteredCrops = extra.allowedCrops.filter((crop) => {
      if ((normalized.resources[crop] ?? 0) <= 0) return false
      if (ctxCropType !== undefined && crop !== ctxCropType) return false
      return true
    })
    if (filteredCrops.length === 0) continue
    selectableFields.push({
      tile: extra.tile,
      allowedCrops: filteredCrops,
      sourceCard: extra.sourceCard,
      groupKey: extra.groupKey,
    })
  }

  const rawMaxSelections =
    typeof actionContext?.maxSelections === 'number'
      ? Math.max(0, Math.floor(actionContext.maxSelections))
      : undefined
  const maxSelections =
    rawMaxSelections === undefined
      ? undefined
      : Math.min(rawMaxSelections, selectableFields.length)
  const minSelections =
    typeof actionContext?.minSelections === 'number'
      ? Math.max(0, Math.floor(actionContext.minSelections))
      : undefined
  return { farmType: 'sow', selectableFields, minSelections, maxSelections }
}

/** Match logical field groups to available seeds; slots of one Card Field
 * count once towards the minimum even when several slots can be sown. */
export const canSowFarmInteraction = (player: PlayerState, farm: InteractionFarmSelection): boolean => {
  if (farm.farmType !== 'sow') return false
  const groups = new Map<string, Set<SowSelection['crop']>>()
  for (const field of farm.selectableFields) {
    const key = field.groupKey ?? positionKey(field.tile)
    const crops = groups.get(key) ?? new Set<SowSelection['crop']>()
    field.allowedCrops.forEach(crop => crops.add(crop))
    groups.set(key, crops)
  }
  // Native sow settlement always requires at least one selected field.
  const required = Math.max(1, farm.minSelections ?? 1)
  if (required > groups.size || required > (farm.maxSelections ?? groups.size)) return false
  const seedSlots = (['grain', 'vegetable', 'wood', 'stone'] as const).flatMap(crop =>
    Array.from({length:Math.min(groups.size, Math.max(0, Math.floor(player.resources[crop] ?? 0)))}, () => crop))
  const allowed = [...groups.values()]
  const owners: Array<number | undefined> = seedSlots.map(() => undefined)
  const assign = (group: number, seen: Set<number>): boolean => {
    for (let slot = 0; slot < seedSlots.length; slot++) {
      if (seen.has(slot) || !allowed[group]!.has(seedSlots[slot]!)) continue
      seen.add(slot)
      const previous = owners[slot]
      if (previous === undefined || assign(previous, seen)) { owners[slot] = group; return true }
    }
    return false
  }
  let matched = 0
  for (let group = 0; group < allowed.length; group++) if (assign(group, new Set()) && ++matched >= required) return true
  return false
}

export const buildFarmPositionSelectionInteraction = (
  player: PlayerState,
  actionContext?: Record<string, unknown>,
): InteractionSelection => {
  const request = buildFarmPositionSelectionRequest(player, actionContext)
  return {
    kind: 'farm-position',
    selectablePositions: request.selectablePositions,
    maxSelections: request.maxSelections ?? 1,
    minSelections: request.minSelections,
    ...(request.allowedSelectionCounts ? { allowedSelectionCounts: request.allowedSelectionCounts } : {}),
    ...(request.validPositionGroups ? { validPositionGroups: request.validPositionGroups } : {}),
  }
}

export const buildFenceFarmInteraction = (
  player: PlayerState,
  spaceId: string,
  actionContext?: Record<string, unknown>,
): InteractionFarmSelection => {
  const normalized = normalizePlayerFarm(player)
  const existing = new Set((normalized.fenceSegments ?? []).map((s) => s.edge))
  const selectableEdges = getAllEdgeIds(normalized).filter(
    (edgeId) => !existing.has(edgeId),
  )
  const extraWood = spaceId === 'farm-redevelopment' ? 1 : 0
  const fencePolicy =
    typeof actionContext?.fencePolicy === 'object' && actionContext.fencePolicy !== null
      ? actionContext.fencePolicy as { sourcePolicy?: unknown }
      : undefined
  const sourcePolicy = fencePolicy?.sourcePolicy as FenceSourcePolicy | undefined
  const fenceSource = isBorrowedFenceSourcePolicy(sourcePolicy)
    ? { kind: 'borrowed' as const, donorCaps: sourcePolicy.donorCaps }
    : undefined
  return {
    farmType: 'fence',
    selectableEdges,
    extraWood,
    ...(fenceSource ? { fenceSource } : {}),
  }
}

export type FarmSelectKind =
  | 'plow'
  | 'sow'
  | 'fence'
  | 'room'
  | 'stable'
  | 'farm-position'

export type SelectableTilesOpts = {
  costOverride?: Partial<Resource>
  costAdjustments?: ConstructCostAdjustments
  exactCost?: ExactCost
  actionContext?: Record<string, unknown>
  spaceId?: string
  zoneFilter?: 'pasture-1'
  max?: number
}

export class FarmInteraction {
  private readonly player: PlayerState
  private readonly state: GameState | undefined

  constructor(player: PlayerState, state?: GameState) {
    this.player = player
    this.state = state
  }

  selectableTiles(
    kind: 'plow' | 'sow' | 'fence' | 'room' | 'stable',
    opts?: SelectableTilesOpts,
  ): InteractionFarmSelection
  selectableTiles(
    kind: 'farm-position',
    opts?: SelectableTilesOpts,
  ): InteractionSelection
  selectableTiles(
    kind: FarmSelectKind,
    opts?: SelectableTilesOpts,
  ): InteractionFarmSelection | InteractionSelection {
    const ctx = opts?.actionContext
    const cost = opts?.costOverride
    switch (kind) {
      case 'plow':
        return buildPlowFarmInteraction(this.player, cost, opts?.exactCost)
      case 'sow':
        return buildSowFarmInteraction(this.player, ctx)
      case 'fence':
        return buildFenceFarmInteraction(this.player, opts?.spaceId ?? '', ctx)
      case 'room':
        return buildRoomFarmInteraction(
          this.player,
          cost,
          opts?.exactCost ? { ...(ctx ?? {}), exactCost: opts.exactCost } : ctx,
          opts?.costAdjustments,
          this.state,
        )
      case 'stable':
        return buildStableFarmInteraction(this.player, cost, {
          zoneFilter: opts?.zoneFilter,
          max: opts?.max,
          exactCost: opts?.exactCost,
        })
      case 'farm-position':
        return buildFarmPositionSelectionInteraction(this.player, ctx)
    }
  }

  permittedExtraSowableFields(actionContext?: Record<string, unknown>) {
    return getPermittedExtraSowableFields(this.player, actionContext)
  }
}

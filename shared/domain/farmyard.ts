import type {
  CropStack,
  FenceSegment,
  FenceSegmentType,
  GameState,
  PlayerState,
  FarmTilePosition,
  InteractionFarmSelection,
  InteractionSelection,
  ExactCost,
  Resource,
} from '../contract/types.ts'
import {
  createDefaultRoomTiles,
  getFarmyardEdgeIds,
  getFarmyardTileKeySet,
  getFarmyardTilePositions,
  isFarmyardBorderEdge,
  isFarmyardEdge,
  isWithinFarmyard,
  parseEdgeId,
  positionKey,
} from '../domain/farm.ts'
import { PaymentSolver } from '../actions/payment'
import { readCardExtraData } from '../cards/helpers/card-state.ts'
import { ANIMAL_KEYS, readAnimalHolderCounts } from './animal-holder-state.ts'
import { ALL_ANIMAL_KEYS, type AnimalKey } from '../contract/animals.ts'
import {
  computeExtraSowableFields,
  collectLockedFarmTileKeys,
} from '../cards/card-effects.ts'
import { computePasturesFromFences, type Pasture as PastureView } from './pasture.ts'
import { isOwnOrdinaryFenceSegment } from './fence-segments.ts'
import { getOrdinaryStableCount } from './stables.ts'

// ---------------------------------------------------------------------------
// Local farm validation types for the inlined validators. These mirror the
// shapes previously exported from `shared/logic/farm/fence-validation.ts`. We keep
// `PlayerFarmState` separate from `PlayerState` because validators are
// generic over `T extends PlayerFarmState` and several callers pass
// stripped-down farm-only objects (rather than full `PlayerState`).
// ---------------------------------------------------------------------------

export type FarmField = {
  stacks: CropStack[]
  row: number
  col: number
}

export type Pasture = {
  id: string
  size: number
  tiles: FarmTilePosition[]
  stables: number
  animalType: AnimalKey | null
  animalCount: number
}

type FarmAnimalType = NonNullable<Pasture['animalType']>

type PlayerFarmAnimalState = PlayerFarmState & {
  houseAnimalType?: FarmAnimalType | null
  houseAnimalCount?: number
  stableAnimals?: Record<string, FarmAnimalType | null>
  cardStates?: PlayerState['cardStates']
}

export type PlayerFarmState = {
  id: string
  name: string
  resources: {
    wood: number
    clay: number
    reed: number
    stone: number
    food: number
    grain: number
    vegetable: number
    sheep: number
    boar: number
    cattle: number
    horse?: number
    fuel?: number
    begging: number
  }
  rooms: number
  houseType: 'wood' | 'clay' | 'stone'
  fields: FarmField[]
  farmyardExtensions?: PlayerState['farmyardExtensions']
  roomTiles: FarmTilePosition[]
  stableTiles: FarmTilePosition[]
  farmTerrain?: PlayerState['farmTerrain']
  fenceSegments: FenceSegment[]
  pastures: Pasture[]
}

export type FenceValidationError = {
  code:
    | 'INVALID_EDGE'
    | 'NO_NEW_FENCES'
    | 'NOT_ENOUGH_WOOD'
    | 'MAX_FENCES_EXCEEDED'
    | 'FENCE_NOT_CONNECTED'
    | 'NO_ENCLOSED_AREA'
    | 'ENCLOSED_TILE_OCCUPIED'
    | 'LOCKED'
    | 'EDGE_TYPE_CONFLICT'
    | 'SEGMENT_TYPE_NOT_ALLOWED'
    | 'PALISADES_NOT_UNLOCKED'
    | 'PALISADE_NOT_ON_BORDER'
    | 'TOO_FEW_FENCES'
    | 'TOO_MANY_FENCES'
    | 'PASTURE_BOUNDS_NOT_MET'
    | 'ANIMAL_CAPACITY_INSUFFICIENT'
    | 'BORROWED_FENCE_SOURCE_REQUIRED'
    | 'BORROWED_FENCE_SOURCE_INVALID'
    | 'BORROWED_FENCE_DONOR_LIMIT_EXCEEDED'
  edges: string[]
  palisadeEdges: string[]
  newFenceEdges: string[]
  newPalisadeEdges: string[]
}

export type FenceValidationResult<T extends PlayerFarmState = PlayerFarmState> =
  | {
      ok: true
      player: T
      newFenceEdges: string[]
      newPalisadeEdges: string[]
      newPastures: Pasture[]
      payableWoodCost: number
    }
  | { ok: false; error: FenceValidationError }

export type BorrowedFenceSourcePolicy = {
  kind: 'borrowed'
  donorCaps: Record<string, number>
}
export type FenceSourcePolicy = 'ownOnly' | BorrowedFenceSourcePolicy
export type FenceCostPolicy = {
  fence?: { wood?: number }
  palisade?: { wood?: number }
  fixedWood?: number
}
export type Bounds = { min?: number; max?: number }
export type FenceSegmentBounds = {
  fence?: Bounds
  palisade?: Bounds
  total?: Bounds
}
export type FencePastureBounds = {
  count?: Bounds
  totalSize?: Bounds
}
export type FenceValidationOptions = {
  skipPayment?: boolean
  allowPalisades?: boolean
  allowedSegmentTypes?: FenceSegmentType[]
  sourcePolicy?: FenceSourcePolicy
  segmentBounds?: FenceSegmentBounds
  newPastureBounds?: FencePastureBounds
  newRegionBounds?: FencePastureBounds
  costPolicy?: FenceCostPolicy
  preserveAnimalTotals?: boolean
  connectionPolicy?: 'allowDisconnected'
  allowedNewRegionTiles?: FarmTilePosition[]
  allowTerrainInNewRegions?: boolean
  suppressTerrainRegions?: boolean
  ordinaryFenceBuildLimit?: number
  availableOrdinaryFenceTokens?: number
  fenceSources?: Record<string, string>
  pastureBounds?: {
    newPastures?: Bounds
    changedPastures?: Bounds
    newPastureSize?: Bounds
  }
}

export type PlowValidationError = {
  code:
    | 'NO_SELECTION'
    | 'INVALID_POSITION'
    | 'OCCUPIED'
    | 'NOT_ADJACENT'
    | 'FENCED'
    | 'LOCKED'
}

export type PlowAdjacencyPolicy = 'default' | 'ignore' | 'notAdjacentToFields'

export type PlowValidationOptions = {
  adjacencyPolicy?: PlowAdjacencyPolicy
}

export type PlowValidationResult<T extends PlayerFarmState = PlayerFarmState> =
  | { ok: true; player: T }
  | { ok: false; error: PlowValidationError }

export type SowSelection = {
  row: number
  col: number
  crop: 'grain' | 'vegetable' | 'wood' | 'stone'
}

export type SowValidationError = {
  code:
    | 'NO_SELECTION'
    | 'INVALID_POSITION'
    | 'NOT_EMPTY'
    | 'NOT_ENOUGH_SEEDS'
    | 'INVALID_CROP'
}

export type SowValidationResult<T extends PlayerFarmState = PlayerFarmState> =
  | { ok: true; player: T }
  | { ok: false; error: SowValidationError }

type SowValidationOptions = {
  /** Selection cap, counted by LOGICAL GROUP (extra-field same groupKey merges to 1). */
  maxSelections?: number
  /** Minimum selected logical fields. Defaults to 1 to preserve ordinary sow validation. */
  minSelections?: number
  excludedFields?: FarmTilePosition[]
  /** Extra sowable fields keyed by position, with their allowed crops. */
  extraAllowedCrops?: Map<string, SowSelection['crop'][]>
  /** Extra sowable fields' logical-field group keys. Multi-slot virtual tiles
   *  with the same groupKey count as 1 selection towards maxSelections. */
  extraGroupKeys?: Map<string, string>
  /** Normal field allowed crops. Defaults to ['grain','vegetable']. Caller
   *  should derive from `actionContext.cropType` (wood/stone → [] since
   *  normal fields don't physically host wood/stone stacks). */
  normalFieldAllowedCrops?: SowSelection['crop'][]
}

const DEFAULT_NORMAL_FIELD_CROPS = ['grain', 'vegetable'] as const satisfies readonly SowSelection['crop'][]
const ALL_CROPS = ['grain', 'vegetable', 'wood', 'stone'] as const satisfies readonly SowSelection['crop'][]

export const isBorrowedFenceSourcePolicy = (
  policy: FenceSourcePolicy | undefined,
): policy is BorrowedFenceSourcePolicy =>
  typeof policy === 'object' &&
  policy !== null &&
  policy.kind === 'borrowed' &&
  typeof (policy as { donorCaps?: unknown }).donorCaps === 'object' &&
  (policy as { donorCaps?: unknown }).donorCaps !== null &&
  !Array.isArray((policy as { donorCaps?: unknown }).donorCaps)

export const borrowedFenceDonorCapTotal = (
  policy: BorrowedFenceSourcePolicy,
): number =>
  Object.values(policy.donorCaps).reduce(
    (sum, cap) => sum + (Number.isInteger(cap) && cap > 0 ? cap : 0),
    0,
  )

export type RoomSelectionResult =
  | { ok: true; selectedKeys: Set<string> }
  | { ok: false; code: string }

export type StableSelectionResult =
  | { ok: true; selectedKeys: Set<string> }
  | { ok: false; code: string }

// ---------------------------------------------------------------------------
// Local geometry helpers (previously private in legacy modules).
// ---------------------------------------------------------------------------

const MAX_FENCES = 15
const MAX_STABLE_COUNT = 4
// Wood cost per stable (mirrors `shared/actions/effects/fencing.stableWoodCost = 2`).
// Inlined to avoid a domain → effects dependency that would create a cycle.
const STABLE_WOOD_COST = 2

const localPositionKey = (pos: FarmTilePosition) => `${pos.row}-${pos.col}`

const regionKey = (tiles: FarmTilePosition[]) =>
  tiles.map(localPositionKey).sort().join('|')

const getEdgeVertices = (edgeId: string): FarmTilePosition[] => {
  const parsed = parseEdgeId(edgeId)
  if (!parsed) return []
  const { type, row, col } = parsed
  if (type === 'H') {
    return [
      { row, col },
      { row, col: col + 1 },
    ]
  }
  return [
    { row, col },
    { row: row + 1, col },
  ]
}

const edgeBetweenTiles = (from: FarmTilePosition, to: FarmTilePosition) => {
  if (from.row === to.row) {
    const row = from.row
    if (to.col === from.col + 1) return `V-${row}-${to.col}`
    if (to.col === from.col - 1) return `V-${row}-${from.col}`
  }
  if (from.col === to.col) {
    const col = from.col
    if (to.row === from.row + 1) return `H-${to.row}-${col}`
    if (to.row === from.row - 1) return `H-${from.row}-${col}`
  }
  return null
}

// ---------------------------------------------------------------------------
// Public utility helpers (formerly in `shared/logic/farm/fence-validation.ts`
// and `shared/logic/farm.ts`). Exported so callers and tests can reference
// them without going through the `Farmyard` class wrapper.
// ---------------------------------------------------------------------------

export const getAllEdgeIds = (player?: Pick<PlayerFarmState, 'farmyardExtensions'>) =>
  getFarmyardEdgeIds(player)

export function normalizePlayerFarm<T extends PlayerFarmState>(player: T): T {
  const desiredRooms = player.rooms ?? 2
  const roomTiles =
    player.roomTiles && player.roomTiles.length > 0
      ? [...player.roomTiles]
      : createDefaultRoomTiles(desiredRooms)
  const farmyardExtensions = player.farmyardExtensions ?? []
  const farmyardTileKeys = getFarmyardTileKeySet({ farmyardExtensions })
  if (roomTiles.length < desiredRooms) {
    const used = new Set(roomTiles.map(localPositionKey))
    getFarmyardTilePositions({ farmyardExtensions }).forEach((pos) => {
      if (roomTiles.length >= desiredRooms) return
      const key = localPositionKey(pos)
      if (used.has(key)) return
      roomTiles.push(pos)
      used.add(key)
    })
  }
  if (roomTiles.length > desiredRooms) {
    roomTiles.length = desiredRooms
  }
  const used = new Set(roomTiles.map(localPositionKey))
  const farmTerrain = (player.farmTerrain ?? []).map((tile) => ({ ...tile }))
  farmTerrain.forEach((tile) => used.add(localPositionKey(tile)))
  const allPositions = getFarmyardTilePositions({ farmyardExtensions })
  const nextEmpty = () =>
    allPositions.find((pos) => !used.has(localPositionKey(pos)))
  const normalizedFields = (player.fields ?? []).flatMap((field) => {
    const row = Number.isFinite(field.row) ? field.row : -1
    const col = Number.isFinite(field.col) ? field.col : -1
    const key = `${row}-${col}`
    if (farmyardTileKeys.has(key) && !used.has(key)) {
      used.add(key)
      return [{ ...field, row, col }]
    }
    const next = nextEmpty()
    if (!next) return []
    used.add(localPositionKey(next))
    return [{ ...field, row: next.row, col: next.col }]
  })
  const usedTiles = new Set(roomTiles.map(localPositionKey))
  farmTerrain.forEach((tile) => usedTiles.add(localPositionKey(tile)))
  normalizedFields.forEach((field) =>
    usedTiles.add(localPositionKey({ row: field.row, col: field.col })),
  )
  const stableTiles = (player.stableTiles ?? []).filter((tile) => {
    const key = localPositionKey(tile)
    if (!farmyardTileKeys.has(key)) return false
    if (usedTiles.has(key)) return false
    usedTiles.add(key)
    return true
  })
  return {
    ...player,
    roomTiles,
    fields: normalizedFields,
    fenceSegments: player.fenceSegments ?? [],
    pastures: player.pastures ?? [],
    stableTiles,
    farmTerrain,
  }
}

export const computeFencedRegions = (
  edgeSet: Set<string>,
  player?: Pick<PlayerFarmState, 'farmyardExtensions'>,
) => {
  const farmTiles = getFarmyardTilePositions(player)
  const farmTileKeys = new Set(farmTiles.map(localPositionKey))
  const visited = new Set<string>()
  const regions: { tiles: FarmTilePosition[]; fenced: boolean }[] = []
  const directions = [
    {
      dr: -1,
      dc: 0,
      edge: (row: number, col: number) => `H-${row}-${col}`,
    },
    {
      dr: 1,
      dc: 0,
      edge: (row: number, col: number) => `H-${row + 1}-${col}`,
    },
    {
      dr: 0,
      dc: -1,
      edge: (row: number, col: number) => `V-${row}-${col}`,
    },
    {
      dr: 0,
      dc: 1,
      edge: (row: number, col: number) => `V-${row}-${col + 1}`,
    },
  ]
  for (const tile of farmTiles) {
    const tileKey = localPositionKey(tile)
    if (visited.has(tileKey)) continue
    const queue: FarmTilePosition[] = [tile]
    visited.add(tileKey)
    const tiles: FarmTilePosition[] = []
    let fenced = true
    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) continue
      tiles.push(current)
      directions.forEach((dir) => {
        const next = {
          row: current.row + dir.dr,
          col: current.col + dir.dc,
        }
        const nextKey = localPositionKey(next)
        if (!farmTileKeys.has(nextKey)) {
          if (!edgeSet.has(dir.edge(current.row, current.col))) {
            fenced = false
          }
          return
        }
        const edgeId = edgeBetweenTiles(current, next)
        if (edgeId && edgeSet.has(edgeId)) return
        if (!visited.has(nextKey)) {
          visited.add(nextKey)
          queue.push(next)
        }
      })
    }
    regions.push({ tiles, fenced })
  }
  return regions
}

const getPastureCapacityLocal = (pasture: Pasture) =>
  pasture.size * 2 * Math.pow(2, pasture.stables ?? 0)

const animalTypesForPlayer = (player: PlayerFarmAnimalState): readonly AnimalKey[] =>
  (player.resources?.horse ?? 0) > 0 ||
  player.houseAnimalType === 'horse' ||
  Object.values(player.stableAnimals ?? {}).includes('horse') ||
  (player.pastures ?? []).some((pasture) => pasture.animalType === 'horse')
    ? ALL_ANIMAL_KEYS
    : ANIMAL_KEYS

const countPastureAnimals = (player: PlayerFarmAnimalState) => {
  const totals: Partial<Record<FarmAnimalType, number>> = { sheep: 0, boar: 0, cattle: 0 }
  for (const pasture of player.pastures ?? []) {
    if (!pasture.animalType || pasture.animalCount <= 0) continue
    totals[pasture.animalType] = (totals[pasture.animalType] ?? 0) + pasture.animalCount
  }
  return totals
}

const countNonPastureAnimals = (player: PlayerFarmAnimalState) => {
  const totals: Partial<Record<FarmAnimalType, number>> = { sheep: 0, boar: 0, cattle: 0 }
  if (player.houseAnimalType && (player.houseAnimalCount ?? 0) > 0) {
    totals[player.houseAnimalType] = (totals[player.houseAnimalType] ?? 0) + (player.houseAnimalCount ?? 0)
  }
  Object.values(player.stableAnimals ?? {}).forEach((animal) => {
    if (animal) totals[animal] = (totals[animal] ?? 0) + 1
  })
  Object.values(player.cardStates ?? {}).forEach((cardState) => {
    const counts = readAnimalHolderCounts(cardState?.extraData)
    for (const key of ALL_ANIMAL_KEYS) {
      const amount = counts[key] ?? 0
      if (amount > 0) totals[key] = (totals[key] ?? 0) + amount
    }
  })
  const c148Held = player.cardStates?.C148_MudWallower?.counters?.held ?? 0
  if (c148Held > 0) {
    const pastureTotals = countPastureAnimals(player)
    const availableBoars = Math.max(
      0,
      (player.resources?.boar ?? 0) -
        (pastureTotals.boar ?? 0) -
        (totals.boar ?? 0),
    )
    totals.boar = (totals.boar ?? 0) + Math.min(Math.floor(c148Held), availableBoars)
  }
  return totals
}

const enforcePastureAnimalCapacity = (
  player: PlayerFarmState,
  sourcePlayer: PlayerFarmState = player,
) => {
  const sourceAnimalPlayer = sourcePlayer as PlayerFarmAnimalState
  const nonPastureTotals = countNonPastureAnimals(sourceAnimalPlayer)
  const animalTypes = animalTypesForPlayer(sourceAnimalPlayer)
  const totals: Partial<Record<FarmAnimalType, number>> = {}
  for (const animalType of animalTypes) {
    totals[animalType] = Math.max(
      0,
      ((player.resources?.[animalType] ?? 0) as number) - (nonPastureTotals[animalType] ?? 0),
    )
  }
  player.pastures = (player.pastures ?? []).map((pasture) => {
    const capacity = getPastureCapacityLocal(pasture)
    if (pasture.animalType) {
      const remaining = totals[pasture.animalType] ?? 0
      const count = Math.min(remaining, capacity)
      totals[pasture.animalType] = remaining - count
      return {
        ...pasture,
        animalCount: count,
        animalType: count > 0 ? pasture.animalType : null,
      }
    }
    return { ...pasture, animalCount: 0, animalType: null }
  })
  const fillPasture = (pasture: Pasture, animalType: Pasture['animalType']) => {
    if (!animalType) return pasture
    const capacity = getPastureCapacityLocal(pasture)
    const remaining = totals[animalType] ?? 0
    if (remaining <= 0) return pasture
    const count = Math.min(remaining, capacity)
    totals[animalType] = remaining - count
    return {
      ...pasture,
      animalType,
      animalCount: count,
    }
  }
  player.pastures = player.pastures.map((pasture) => {
    if (pasture.animalType) return pasture
    for (const animalType of animalTypes) {
      const next = fillPasture(pasture, animalType)
      if (next.animalType) return next
    }
    return pasture
  })
  animalTypes.forEach((animalType) => {
    const pastureCount = player.pastures
      .filter((pasture) => pasture.animalType === animalType)
      .reduce((sum, pasture) => sum + pasture.animalCount, 0)
    player.resources[animalType] =
      pastureCount +
      Math.min(nonPastureTotals[animalType] ?? 0, player.resources?.[animalType] ?? 0)
  })
}

// ---------------------------------------------------------------------------
// Validators (inlined from `shared/logic/farm/{plow,sow,fence,validators}.ts`).
// ---------------------------------------------------------------------------

const getFencedTileKeys = (player: PlayerFarmState) => {
  const edgeSet = new Set((player.fenceSegments ?? []).map((s) => s.edge))
  if (edgeSet.size === 0) return new Set<string>()
  const regions = computeFencedRegions(edgeSet, player).filter((region) => region.fenced)
  const fencedKeys = new Set<string>()
  regions.forEach((region) => {
    region.tiles.forEach((tile) => fencedKeys.add(localPositionKey(tile)))
  })
  return fencedKeys
}

export const validatePlowSelection = <T extends PlayerFarmState>(
  player: T,
  tile?: FarmTilePosition,
  lockedKeys?: Set<string>,
  options: PlowValidationOptions = {},
): PlowValidationResult<T> => {
  if (!tile) {
    return { ok: false, error: { code: 'NO_SELECTION' } }
  }
  const normalized = normalizePlayerFarm(player)
  if (!isWithinFarmyard(normalized, tile)) {
    return { ok: false, error: { code: 'INVALID_POSITION' } }
  }
  const occupied = new Set(normalized.roomTiles.map(localPositionKey))
  normalized.farmTerrain?.forEach((tile) => occupied.add(localPositionKey(tile)))
  normalized.fields.forEach((field) =>
    occupied.add(localPositionKey({ row: field.row, col: field.col })),
  )
  normalized.stableTiles.forEach((stable) => occupied.add(localPositionKey(stable)))
  const targetKey = localPositionKey(tile)
  if (occupied.has(targetKey)) {
    return { ok: false, error: { code: 'OCCUPIED' } }
  }
  const fencedKeys = getFencedTileKeys(normalized)
  if (fencedKeys.has(targetKey)) {
    return { ok: false, error: { code: 'FENCED' } }
  }
  if (lockedKeys?.has(targetKey)) {
    return { ok: false, error: { code: 'LOCKED' } }
  }
  if (normalized.fields.length > 0) {
    const fieldKeys = new Set(
      normalized.fields.map((field) =>
        localPositionKey({ row: field.row, col: field.col }),
      ),
    )
    const deltas = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ]
    const adjacent = deltas.some((delta) =>
      fieldKeys.has(`${tile.row + delta.dr}-${tile.col + delta.dc}`),
    )
    if (options.adjacencyPolicy === 'notAdjacentToFields' && adjacent) {
      return { ok: false, error: { code: 'NOT_ADJACENT' } }
    }
    if ((options.adjacencyPolicy ?? 'default') === 'default' && !adjacent) {
      return { ok: false, error: { code: 'NOT_ADJACENT' } }
    }
  }
  const updated = {
    ...normalized,
    fields: [
      ...normalized.fields,
      { stacks: [], row: tile.row, col: tile.col },
    ],
  }
  return { ok: true, player: updated as T }
}

const buildFieldMap = (fields: FarmField[]) => {
  const map = new Map<string, FarmField>()
  fields.forEach((field) => {
    map.set(localPositionKey({ row: field.row, col: field.col }), field)
  })
  return map
}

export const validateSowSelection = <T extends PlayerFarmState>(
  player: T,
  selections: SowSelection[],
  options: SowValidationOptions = {},
): SowValidationResult<T> => {
  if (!Array.isArray(selections) || selections.length === 0) {
    return { ok: false, error: { code: 'NO_SELECTION' } }
  }
  const normalized = normalizePlayerFarm(player)
  const fieldMap = buildFieldMap(normalized.fields)
  const normalAllowed: readonly SowSelection['crop'][] =
    options.normalFieldAllowedCrops ?? DEFAULT_NORMAL_FIELD_CROPS
  const used = new Set<string>()
  const usedGroups = new Set<string>()
  const excluded = new Set(
    (options.excludedFields ?? []).map((field) => localPositionKey(field)),
  )
  const cropCount: Record<SowSelection['crop'], number> = {
    grain: 0,
    vegetable: 0,
    wood: 0,
    stone: 0,
  }
  for (const selection of selections) {
    const row = Number(selection?.row)
    const col = Number(selection?.col)
    if (!Number.isFinite(row) || !Number.isFinite(col)) {
      return { ok: false, error: { code: 'INVALID_POSITION' } }
    }
    const crop = selection?.crop as SowSelection['crop']
    if (!ALL_CROPS.includes(crop)) {
      return { ok: false, error: { code: 'INVALID_CROP' } }
    }
    const pos = { row, col }
    const key = localPositionKey(pos)
    const extraAllowedCrops = options.extraAllowedCrops?.get(key)
    const isExtraField = extraAllowedCrops !== undefined
    const allowedHere: readonly SowSelection['crop'][] = isExtraField
      ? extraAllowedCrops
      : normalAllowed
    if (!allowedHere.includes(crop)) {
      return { ok: false, error: { code: 'INVALID_CROP' } }
    }
    if (!isExtraField && !isWithinFarmyard(normalized, pos)) {
      return { ok: false, error: { code: 'INVALID_POSITION' } }
    }
    if (used.has(key)) continue
    if (excluded.has(key)) {
      return { ok: false, error: { code: 'INVALID_POSITION' } }
    }
    const field = fieldMap.get(key)
    if (!isExtraField && (!field || field.stacks.length !== 0)) {
      return { ok: false, error: { code: 'NOT_EMPTY' } }
    }
    used.add(key)
    const groupKey = isExtraField
      ? (options.extraGroupKeys?.get(key) ?? key)
      : key
    usedGroups.add(groupKey)
    if (isExtraField) continue
    cropCount[crop] += 1
  }
  if (
    typeof options.maxSelections === 'number' &&
    usedGroups.size > Math.max(0, Math.floor(options.maxSelections))
  ) {
    return { ok: false, error: { code: 'INVALID_POSITION' } }
  }
  const minSelections = typeof options.minSelections === 'number'
    ? Math.max(0, Math.floor(options.minSelections))
    : 1
  if (usedGroups.size < minSelections) {
    return { ok: false, error: { code: 'NO_SELECTION' } }
  }
  for (const crop of ALL_CROPS) {
    if (cropCount[crop] > (normalized.resources?.[crop] ?? 0)) {
      return { ok: false, error: { code: 'NOT_ENOUGH_SEEDS' } }
    }
  }
  const updatedFields: FarmField[] = normalized.fields.map((field) => {
    const selection = selections.find(
      (item) => item.row === field.row && item.col === field.col,
    )
    if (!selection) return field
    const key = localPositionKey({ row: field.row, col: field.col })
    if (options.extraAllowedCrops?.has(key)) return field
    if (selection.crop === 'grain') {
      return {
        ...field,
        stacks: [...field.stacks, { kind: 'grain', remaining: 3 }],
      }
    }
    if (selection.crop === 'vegetable') {
      return {
        ...field,
        stacks: [...field.stacks, { kind: 'vegetable', remaining: 2 }],
      }
    }
    return field
  })
  const updated = {
    ...normalized,
    fields: updatedFields,
    resources: {
      ...normalized.resources,
      grain: (normalized.resources?.grain ?? 0) - cropCount.grain,
      vegetable: (normalized.resources?.vegetable ?? 0) - cropCount.vegetable,
    },
  }
  return { ok: true, player: updated as T }
}

export const validateRoomSelection = (
  player: PlayerFarmState,
  rooms: { row: number; col: number }[],
  lockedKeys?: Set<string>,
): RoomSelectionResult => {
  if (rooms.length === 0) {
    return { ok: false, code: 'NO_SELECTION' }
  }
  const normalized = normalizePlayerFarm(player)
  const roomSet = new Set(normalized.roomTiles.map(localPositionKey))
  const fieldSet = new Set(
    (normalized.fields ?? []).map((field) => localPositionKey(field)),
  )
  const stableSet = new Set(
    (normalized.stableTiles ?? []).map((tile) => localPositionKey(tile)),
  )
  const pastureSet = new Set(
    (normalized.pastures ?? [])
      .flatMap((pasture) => pasture.tiles ?? [])
      .map(localPositionKey),
  )
  const terrainSet = new Set((normalized.farmTerrain ?? []).map(localPositionKey))
  const selectedSet = new Set<string>()
  for (const room of rooms) {
    if (!isWithinFarmyard(normalized, room)) {
      return { ok: false, code: 'INVALID_POSITION' }
    }
    const key = localPositionKey(room)
    if (selectedSet.has(key)) continue
    if (
      roomSet.has(key) ||
      fieldSet.has(key) ||
      stableSet.has(key) ||
      pastureSet.has(key) ||
      terrainSet.has(key)
    ) {
      return { ok: false, code: 'OCCUPIED' }
    }
    if (lockedKeys?.has(key)) {
      return { ok: false, code: 'LOCKED' }
    }
    selectedSet.add(key)
  }
  if (selectedSet.size === 0) {
    return { ok: false, code: 'NO_SELECTION' }
  }
  const visited = new Set(roomSet)
  const queue = normalized.roomTiles.map((tile) => ({ row: tile.row, col: tile.col }))
  const directions = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    directions.forEach((dir) => {
      const next = { row: current.row + dir.dr, col: current.col + dir.dc }
      if (!isWithinFarmyard(normalized, next)) return
      const key = localPositionKey(next)
      if (!selectedSet.has(key) || visited.has(key)) return
      visited.add(key)
      queue.push(next)
    })
  }
  const allConnected = Array.from(selectedSet).every((key) => visited.has(key))
  if (!allConnected) {
    return { ok: false, code: 'NOT_CONNECTED' }
  }
  return { ok: true, selectedKeys: selectedSet }
}

export const validateStableSelection = (
  player: PlayerFarmState,
  stables: { row: number; col: number }[],
  lockedKeys?: Set<string>,
): StableSelectionResult => {
  if (stables.length === 0) {
    return { ok: false, code: 'NO_SELECTION' }
  }
  const normalized = normalizePlayerFarm(player)
  const roomSet = new Set(normalized.roomTiles.map(localPositionKey))
  const fieldSet = new Set(
    (normalized.fields ?? []).map((field) => localPositionKey(field)),
  )
  const stableSet = new Set(
    (normalized.stableTiles ?? []).map((tile) => localPositionKey(tile)),
  )
  const terrainSet = new Set((normalized.farmTerrain ?? []).map(localPositionKey))
  const selectedSet = new Set<string>()
  for (const stable of stables) {
    if (!isWithinFarmyard(normalized, stable)) {
      return { ok: false, code: 'INVALID_POSITION' }
    }
    const key = localPositionKey(stable)
    if (selectedSet.has(key)) continue
    if (roomSet.has(key) || fieldSet.has(key) || stableSet.has(key) || terrainSet.has(key)) {
      return { ok: false, code: 'OCCUPIED' }
    }
    if (lockedKeys?.has(key)) {
      return { ok: false, code: 'LOCKED' }
    }
    selectedSet.add(key)
  }
  if (selectedSet.size === 0) {
    return { ok: false, code: 'NO_SELECTION' }
  }
  if (stableSet.size + selectedSet.size > MAX_STABLE_COUNT) {
    return { ok: false, code: 'LIMIT_REACHED' }
  }
  return { ok: true, selectedKeys: selectedSet }
}

export const validateFenceSelection = <T extends PlayerFarmState>(
  player: T,
  edges: string[],
  palisadeEdges: string[] = [],
  extraWood = 0,
  freeFences = 0,
  options: FenceValidationOptions = {},
  lockedKeys?: Set<string>,
): FenceValidationResult<T> => {
  const extraCost = Number.isFinite(extraWood) ? Math.max(0, extraWood) : 0
  const freeFenceCount = Number.isFinite(freeFences) ? Math.max(0, freeFences) : 0
  const normalized = normalizePlayerFarm(player)

  const allInputEdges = [...edges, ...palisadeEdges]
  const parsedEdges = allInputEdges.map((edge) => parseEdgeId(edge))
  if (
    parsedEdges.some((edge) => edge === null) ||
    allInputEdges.some((edge) => !isFarmyardEdge(normalized, edge))
  ) {
    return {
      ok: false,
      error: {
        code: 'INVALID_EDGE',
        edges,
        palisadeEdges,
        newFenceEdges: [],
        newPalisadeEdges: [],
      },
    }
  }

  const fenceSet = new Set(edges)
  const conflictEdge = palisadeEdges.find((e) => fenceSet.has(e))
  if (conflictEdge) {
    return {
      ok: false,
      error: {
        code: 'EDGE_TYPE_CONFLICT',
        edges,
        palisadeEdges,
        newFenceEdges: [],
        newPalisadeEdges: [],
      },
    }
  }

  if (palisadeEdges.length > 0 && !options.allowPalisades) {
    return {
      ok: false,
      error: {
        code: 'PALISADES_NOT_UNLOCKED',
        edges,
        palisadeEdges,
        newFenceEdges: [],
        newPalisadeEdges: [],
      },
    }
  }

  const existingEdgeIds = new Set(
    (normalized.fenceSegments ?? []).map((s) => s.edge),
  )
  const newFenceEdges = Array.from(
    new Set(edges.filter((e) => !existingEdgeIds.has(e))),
  )
  const newPalisadeEdges = Array.from(
    new Set(palisadeEdges.filter((e) => !existingEdgeIds.has(e))),
  )

  const allowedSegmentTypes = options.allowedSegmentTypes
  const borrowedSourcePolicy = isBorrowedFenceSourcePolicy(options.sourcePolicy)
    ? options.sourcePolicy
    : undefined
  if (
    allowedSegmentTypes &&
    ((newFenceEdges.length > 0 && !allowedSegmentTypes.includes('fence')) ||
      (newPalisadeEdges.length > 0 && !allowedSegmentTypes.includes('palisade')))
  ) {
    return {
      ok: false,
      error: {
        code: 'SEGMENT_TYPE_NOT_ALLOWED',
        edges,
        palisadeEdges,
        newFenceEdges,
        newPalisadeEdges,
      },
    }
  }
  if (borrowedSourcePolicy && newPalisadeEdges.length > 0) {
    return {
      ok: false,
      error: {
        code: 'SEGMENT_TYPE_NOT_ALLOWED',
        edges,
        palisadeEdges,
        newFenceEdges,
        newPalisadeEdges,
      },
    }
  }

  const boundError = (
    value: number,
    bounds: Bounds | undefined,
  ): 'TOO_FEW_FENCES' | 'TOO_MANY_FENCES' | undefined => {
    if (bounds?.min !== undefined && value < bounds.min) return 'TOO_FEW_FENCES'
    if (bounds?.max !== undefined && value > bounds.max) return 'TOO_MANY_FENCES'
    return undefined
  }
  const segmentBounds = options.segmentBounds
  const totalNewSegments = newFenceEdges.length + newPalisadeEdges.length
  const segmentError =
    boundError(newFenceEdges.length, segmentBounds?.fence) ??
    boundError(newPalisadeEdges.length, segmentBounds?.palisade) ??
    boundError(totalNewSegments, segmentBounds?.total)
  if (segmentError) {
    return {
      ok: false,
      error: {
        code: segmentError,
        edges,
        palisadeEdges,
        newFenceEdges,
        newPalisadeEdges,
      },
    }
  }
  if (newFenceEdges.length === 0 && newPalisadeEdges.length === 0) {
    return {
      ok: false,
      error: {
        code: 'NO_NEW_FENCES',
        edges,
        palisadeEdges,
        newFenceEdges,
        newPalisadeEdges,
      },
    }
  }

  const borrowedFenceSources = borrowedSourcePolicy ? options.fenceSources : undefined
  const borrowedDonorCounts = new Map<string, number>()
  if (borrowedSourcePolicy) {
    if (!borrowedFenceSources || typeof borrowedFenceSources !== 'object') {
      return {
        ok: false,
        error: {
          code: 'BORROWED_FENCE_SOURCE_REQUIRED',
          edges,
          palisadeEdges,
          newFenceEdges,
          newPalisadeEdges,
        },
      }
    }
    const expectedEdges = new Set(newFenceEdges)
    const sourceEdges = Object.keys(borrowedFenceSources)
    const sourceEdgesMatch =
      sourceEdges.length === expectedEdges.size &&
      sourceEdges.every((edge) => expectedEdges.has(edge))
    if (!sourceEdgesMatch) {
      return {
        ok: false,
        error: {
          code: 'BORROWED_FENCE_SOURCE_INVALID',
          edges,
          palisadeEdges,
          newFenceEdges,
          newPalisadeEdges,
        },
      }
    }
    for (const edge of newFenceEdges) {
      const donorId = borrowedFenceSources[edge]
      if (
        typeof donorId !== 'string' ||
        donorId === normalized.id ||
        borrowedSourcePolicy.donorCaps[donorId] === undefined
      ) {
        return {
          ok: false,
          error: {
            code: 'BORROWED_FENCE_SOURCE_INVALID',
            edges,
            palisadeEdges,
            newFenceEdges,
            newPalisadeEdges,
          },
        }
      }
      borrowedDonorCounts.set(donorId, (borrowedDonorCounts.get(donorId) ?? 0) + 1)
    }
    for (const [donorId, count] of borrowedDonorCounts) {
      const cap = borrowedSourcePolicy.donorCaps[donorId] ?? 0
      if (count > cap) {
        return {
          ok: false,
          error: {
            code: 'BORROWED_FENCE_DONOR_LIMIT_EXCEEDED',
            edges,
            palisadeEdges,
            newFenceEdges,
            newPalisadeEdges,
          },
        }
      }
    }
  }

  const invalidPalisade = newPalisadeEdges.find((e) => !isFarmyardBorderEdge(normalized, e))
  if (invalidPalisade) {
    return {
      ok: false,
      error: {
        code: 'PALISADE_NOT_ON_BORDER',
        edges,
        palisadeEdges,
        newFenceEdges: [],
        newPalisadeEdges: [],
      },
    }
  }

  const payableFenceCount = Math.max(
    0,
    newFenceEdges.length - freeFenceCount,
  )
  const fenceWoodCost = options.costPolicy?.fence?.wood
  const payableFenceWoodCost =
    fenceWoodCost === undefined
      ? payableFenceCount
      : payableFenceCount * fenceWoodCost
  const palisadeWoodCost = options.costPolicy?.palisade?.wood ?? 2
  const fixedWoodCost = Math.max(0, options.costPolicy?.fixedWood ?? 0)
  const payableWoodCost =
    payableFenceWoodCost + palisadeWoodCost * newPalisadeEdges.length + extraCost + fixedWoodCost

  const existingFenceCount = borrowedSourcePolicy
    ? 0
    : (normalized.fenceSegments ?? []).filter((s) =>
        isOwnOrdinaryFenceSegment(s, normalized.id),
      ).length
  const ordinaryBuildLimit =
    options.ordinaryFenceBuildLimit ??
    (borrowedSourcePolicy ? borrowedFenceDonorCapTotal(borrowedSourcePolicy) : MAX_FENCES)
  if (existingFenceCount + newFenceEdges.length > ordinaryBuildLimit) {
    return {
      ok: false,
      error: {
        code: 'MAX_FENCES_EXCEEDED',
        edges,
        palisadeEdges,
        newFenceEdges,
        newPalisadeEdges,
      },
    }
  }
  if (
    options.availableOrdinaryFenceTokens !== undefined &&
    newFenceEdges.length > options.availableOrdinaryFenceTokens
  ) {
    return {
      ok: false,
      error: {
        code: 'MAX_FENCES_EXCEEDED',
        edges,
        palisadeEdges,
        newFenceEdges,
        newPalisadeEdges,
      },
    }
  }

  const existingEdges = new Set(existingEdgeIds)
  const allNewEdges = [...newFenceEdges, ...newPalisadeEdges]
  if (existingEdges.size > 0 && options.connectionPolicy !== 'allowDisconnected') {
    const existingVertices = new Set(
      Array.from(existingEdges).flatMap((edge) =>
        getEdgeVertices(edge).map(localPositionKey),
      ),
    )
    const connects = allNewEdges.some((edge) =>
      getEdgeVertices(edge).some((vertex) =>
        existingVertices.has(localPositionKey(vertex)),
      ),
    )
    if (!connects) {
      return {
        ok: false,
        error: {
          code: 'FENCE_NOT_CONNECTED',
          edges,
          palisadeEdges,
          newFenceEdges,
          newPalisadeEdges,
        },
      }
    }
  }

  const edgeSet = new Set([...existingEdges, ...allNewEdges])
  const regions = computeFencedRegions(edgeSet, normalized)
  const fencedRegions = regions.filter((region) => region.fenced)
  if (fencedRegions.length === 0) {
    return {
      ok: false,
      error: {
        code: 'NO_ENCLOSED_AREA',
        edges,
        palisadeEdges,
        newFenceEdges,
        newPalisadeEdges,
      },
    }
  }

  const previousPastureKeys = new Set(
    normalized.pastures.map((pasture) => regionKey(pasture.tiles)),
  )
  const changedRegions = fencedRegions.filter((region) =>
    !previousPastureKeys.has(regionKey(region.tiles)),
  )
  const allowedRegionKeys = options.allowedNewRegionTiles
    ? new Set(options.allowedNewRegionTiles.map(localPositionKey))
    : undefined
  if (
    allowedRegionKeys &&
    changedRegions.some((region) =>
      region.tiles.some((tile) => !allowedRegionKeys.has(localPositionKey(tile))),
    )
  ) {
    return {
      ok: false,
      error: {
        code: 'PASTURE_BOUNDS_NOT_MET',
        edges,
        palisadeEdges,
        newFenceEdges,
        newPalisadeEdges,
      },
    }
  }
  const newRegionBounds = options.newRegionBounds
  if (newRegionBounds) {
    const count = changedRegions.length
    const totalSize = changedRegions.reduce((sum, region) => sum + region.tiles.length, 0)
    const countBounds = newRegionBounds.count
    const sizeBounds = newRegionBounds.totalSize
    const countTooLow = countBounds?.min !== undefined && count < countBounds.min
    const countTooHigh = countBounds?.max !== undefined && count > countBounds.max
    const sizeTooLow = sizeBounds?.min !== undefined && totalSize < sizeBounds.min
    const sizeTooHigh = sizeBounds?.max !== undefined && totalSize > sizeBounds.max
    if (countTooLow || countTooHigh || sizeTooLow || sizeTooHigh) {
      return {
        ok: false,
        error: {
          code: 'PASTURE_BOUNDS_NOT_MET',
          edges,
          palisadeEdges,
          newFenceEdges,
          newPalisadeEdges,
        },
      }
    }
  }

  const changedRegionKeys = new Set(changedRegions.map((region) => regionKey(region.tiles)))
  const roomSet = new Set(normalized.roomTiles.map(localPositionKey))
  const fieldSet = new Set(
    normalized.fields.map((field) =>
      localPositionKey({ row: field.row, col: field.col }),
    ),
  )
  const terrainSet = new Set((normalized.farmTerrain ?? []).map(localPositionKey))
  const occupiedRegion = fencedRegions.find((region) =>
    region.tiles.some(
      (tile) => {
        const key = localPositionKey(tile)
        return roomSet.has(key) ||
          fieldSet.has(key) ||
          (
            terrainSet.has(key) &&
            !(
              options.allowTerrainInNewRegions &&
              changedRegionKeys.has(regionKey(region.tiles))
            )
          )
      },
    ),
  )
  if (occupiedRegion) {
    return {
      ok: false,
      error: {
        code: 'ENCLOSED_TILE_OCCUPIED',
        edges,
        palisadeEdges,
        newFenceEdges,
        newPalisadeEdges,
      },
    }
  }

  if (lockedKeys && lockedKeys.size > 0) {
    const lockedRegion = fencedRegions.find((region) =>
      region.tiles.some((tile) => lockedKeys.has(localPositionKey(tile))),
    )
    if (lockedRegion) {
      return {
        ok: false,
        error: {
          code: 'LOCKED',
          edges,
          palisadeEdges,
          newFenceEdges,
          newPalisadeEdges,
        },
      }
    }
  }

  const stableSet = new Set(normalized.stableTiles.map(localPositionKey))
  const pastureRegions = options.suppressTerrainRegions
    ? fencedRegions.filter((region) =>
      !region.tiles.some((tile) => terrainSet.has(localPositionKey(tile))),
    )
    : fencedRegions
  const pastures: Pasture[] = pastureRegions.map((region, index) => ({
    id: `pasture-${index + 1}`,
    size: region.tiles.length,
    tiles: region.tiles,
    stables: region.tiles.filter((tile) =>
      stableSet.has(localPositionKey(tile)),
    ).length,
    animalType: null,
    animalCount: 0,
  }))
  const newPastures = pastures.filter((pasture) => {
    const pastureKey = regionKey(pasture.tiles)
    return !previousPastureKeys.has(pastureKey)
  })
  const newPastureCount = Math.max(0, pastures.length - normalized.pastures.length)
  const pastureBounds = options.pastureBounds
  const pastureCountError =
    boundError(newPastureCount, pastureBounds?.newPastures) ??
    boundError(newPastures.length, pastureBounds?.changedPastures)
  if (pastureCountError) {
    return {
      ok: false,
      error: {
        code: pastureCountError,
        edges,
        palisadeEdges,
        newFenceEdges,
        newPalisadeEdges,
      },
    }
  }
  const sizeBounds = pastureBounds?.newPastureSize
  const pastureSizeError =
    sizeBounds &&
    newPastures
      .map((pasture) => boundError(pasture.size, sizeBounds))
      .find((error): error is 'TOO_FEW_FENCES' | 'TOO_MANY_FENCES' => error !== undefined)
  if (pastureSizeError) {
    return {
      ok: false,
      error: {
        code: pastureSizeError,
        edges,
        palisadeEdges,
        newFenceEdges,
        newPalisadeEdges,
      },
    }
  }

  const newPastureBounds = options.newPastureBounds
  if (newPastureBounds) {
    const count = newPastures.length
    const totalSize = newPastures.reduce((sum, pasture) => sum + pasture.size, 0)
    const countBounds = newPastureBounds.count
    const sizeBounds = newPastureBounds.totalSize
    const countTooLow = countBounds?.min !== undefined && count < countBounds.min
    const countTooHigh = countBounds?.max !== undefined && count > countBounds.max
    const sizeTooLow = sizeBounds?.min !== undefined && totalSize < sizeBounds.min
    const sizeTooHigh = sizeBounds?.max !== undefined && totalSize > sizeBounds.max
    if (countTooLow || countTooHigh || sizeTooLow || sizeTooHigh) {
      return {
        ok: false,
        error: {
          code: 'PASTURE_BOUNDS_NOT_MET',
          edges,
          palisadeEdges,
          newFenceEdges,
          newPalisadeEdges,
        },
      }
    }
  }

  if (
    !options.skipPayment &&
    (normalized.resources?.wood ?? 0) < payableWoodCost
  ) {
    return {
      ok: false,
      error: {
        code: 'NOT_ENOUGH_WOOD',
        edges,
        palisadeEdges,
        newFenceEdges,
        newPalisadeEdges,
      },
    }
  }

  const newSegments: FenceSegment[] = [
    ...newFenceEdges.map((edge) => ({
      edge,
      type: 'fence' as const,
      source: borrowedSourcePolicy
        ? { kind: 'borrowed' as const, ownerPlayerId: borrowedFenceSources![edge]! }
        : { kind: 'own' as const, ownerPlayerId: normalized.id },
    })),
    ...newPalisadeEdges.map((edge) => ({
      edge,
      type: 'palisade' as const,
      source: { kind: 'own' as const, ownerPlayerId: normalized.id },
    })),
  ]
  const animalTotalsBefore = {
    sheep: normalized.resources?.sheep ?? 0,
    boar: normalized.resources?.boar ?? 0,
    cattle: normalized.resources?.cattle ?? 0,
  }

  const updated: PlayerFarmState = {
    ...normalized,
    resources: {
      ...normalized.resources,
      wood: options.skipPayment
        ? (normalized.resources?.wood ?? 0)
        : (normalized.resources?.wood ?? 0) - payableWoodCost,
    },
    fenceSegments: [...(normalized.fenceSegments ?? []), ...newSegments],
    pastures,
  }
  enforcePastureAnimalCapacity(updated, normalized)
  if (options.preserveAnimalTotals) {
    const animalTotalsAfter = {
      sheep: updated.resources?.sheep ?? 0,
      boar: updated.resources?.boar ?? 0,
      cattle: updated.resources?.cattle ?? 0,
    }
    if (
      animalTotalsBefore.sheep !== animalTotalsAfter.sheep ||
      animalTotalsBefore.boar !== animalTotalsAfter.boar ||
      animalTotalsBefore.cattle !== animalTotalsAfter.cattle
    ) {
      return {
        ok: false,
        error: {
          code: 'ANIMAL_CAPACITY_INSUFFICIENT',
          edges,
          palisadeEdges,
          newFenceEdges,
          newPalisadeEdges,
        },
      }
    }
  }
  return {
    ok: true,
    player: updated as T,
    newFenceEdges,
    newPalisadeEdges,
    newPastures,
    payableWoodCost,
  }
}

// ---------------------------------------------------------------------------
// Build-room helper (formerly `shared/logic/farm/build-room-helper.ts`).
// ---------------------------------------------------------------------------

/**
 * Try to add one room tile at any free farmyard position.
 * Increments player.rooms and pushes to player.roomTiles on success.
 * Used by future-meeples roomType resolution (B14 Hawktower at round 12).
 */
export const tryAddRoomTile = (
  player: PlayerState,
  _type: 'wood' | 'clay' | 'stone',
): boolean => {
  const used = new Set<string>()
  for (const tile of player.roomTiles ?? []) used.add(positionKey(tile))
  for (const tile of player.farmTerrain ?? []) used.add(positionKey(tile))
  for (const tile of player.stableTiles ?? []) used.add(positionKey(tile))
  for (const field of player.fields ?? []) used.add(positionKey(field))
  for (const pasture of player.pastures ?? []) {
    for (const tile of pasture.tiles ?? []) used.add(positionKey(tile))
  }
  for (const pos of getFarmyardTilePositions(player)) {
    if (used.has(positionKey(pos))) continue
    player.roomTiles = [...(player.roomTiles ?? []), pos]
    player.rooms = (player.rooms ?? 0) + 1
    return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Farm-interaction builders (formerly `shared/logic/farm/farm-interaction.ts`).
// ---------------------------------------------------------------------------

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
    PaymentSolver.getMaxBuildableRooms(player, costOverride, actionContext),
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
  let resourceMax = 0
  for (let count = 1; count <= structuralMax; count += 1) {
    const totalCost = PaymentSolver.resolveUnitCostWithDelta(
      { wood: STABLE_WOOD_COST },
      options?.exactCost,
      costOverride,
      count,
    )
    if (!totalCost || !PaymentSolver.canAffordTypedFlatCost(player, totalCost, 'stables')) break
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

const getAllowedSelectedFieldKeys = (
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

  // Derive normal-field allow-list from actionContext.cropType. wood/stone =>
  // [] because normal fields physically host only grain/vegetable stacks
  // (3/2 initial). See spec §2.5 "P0 修正" — wood/stone sow exclusively via
  // extra-field path.
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

export const buildFarmPositionSelectionInteraction = (
  player: PlayerState,
  actionContext?: Record<string, unknown>,
): InteractionSelection => {
  const selectableTiles = Array.isArray(actionContext?.selectableTiles)
    ? actionContext.selectableTiles.flatMap((tile) => {
        const row = Number((tile as { row?: unknown }).row)
        const col = Number((tile as { col?: unknown }).col)
        if (!Number.isFinite(row) || !Number.isFinite(col)) return []
        return [{ row, col }]
      })
    : null
  const validPositionGroups = Array.isArray(actionContext?.validPositionGroups)
    ? actionContext.validPositionGroups.flatMap((group) => {
        if (!Array.isArray(group)) return []
        const positions = group.flatMap((tile) => {
          const row = Number((tile as { row?: unknown }).row)
          const col = Number((tile as { col?: unknown }).col)
          if (!Number.isFinite(row) || !Number.isFinite(col)) return []
          return [{ row, col }]
        })
        return positions.length > 0 ? [positions] : []
      })
    : undefined
  const filter = actionContext?.positionFilter as string | undefined
  const maxSelections = (actionContext?.maxSelections as number) ?? 1
  const minSelections = (actionContext?.minSelections as number) ?? 1
  const allowedSelectionCounts = Array.isArray(actionContext?.allowedSelectionCounts)
    ? actionContext.allowedSelectionCounts
        .filter((count): count is number => typeof count === 'number' && Number.isInteger(count))
    : undefined
  const selectablePositions: FarmTilePosition[] =
    selectableTiles ??
    player.fields
      .filter((f) => {
        const top = f.stacks[f.stacks.length - 1]
        if (!filter) return true
        if (filter === 'has-vegetable')
          return top?.kind === 'vegetable' && top.remaining > 0
        if (filter === 'has-grain')
          return top?.kind === 'grain' && top.remaining > 0
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
    ...(allowedSelectionCounts ? { allowedSelectionCounts } : {}),
    ...(validPositionGroups ? { validPositionGroups } : {}),
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

// ---------------------------------------------------------------------------
// Farmyard class — kept as the public domain facade for query/build helpers.
// ---------------------------------------------------------------------------

export type FarmSelectKind =
  | 'plow'
  | 'sow'
  | 'fence'
  | 'room'
  | 'stable'
  | 'farm-position'

export type FenceSpec = {
  edges: string[]
  palisadeEdges?: string[]
  extraWood?: number
  freeFences?: number
  fenceSources?: Record<string, string>
  options?: FenceValidationOptions
  lockedKeys?: Set<string>
}

export type SelectableTilesOpts = {
  costOverride?: Partial<Resource>
  exactCost?: ExactCost
  actionContext?: Record<string, unknown>
  spaceId?: string
  zoneFilter?: 'pasture-1'
  max?: number
}

/**
 * View of a player's farmyard. Owns the farm-validation + farm-interaction
 * logic previously in `shared/logic/farm/*`. Query methods do NOT mutate
 * the underlying `PlayerState` (mutation contract by convention).
 */
export class Farmyard {
  private readonly player: PlayerState
  private readonly state: Readonly<GameState>

  constructor(player: PlayerState, state: Readonly<GameState>) {
    this.player = player
    this.state = state
  }

  /** Underlying state (escape hatch for downstream migrations). */
  protected getState(): Readonly<GameState> {
    return this.state
  }

  /**
   * Validate a single plow tile selection. `coord` may be undefined to
   * mirror legacy `validatePlowSelection` behavior — that returns
   * `NO_SELECTION` rather than throwing.
   */
  canPlow(
    coord: FarmTilePosition | undefined,
    lockedKeys?: Set<string>,
    options?: PlowValidationOptions,
  ): PlowValidationResult<PlayerState> {
    return validatePlowSelection(this.player, coord, lockedKeys, options)
  }

  /** Validate a sow selection (one or more fields with crop assignments). */
  canSow(
    selection: { fields: SowSelection[] },
    options?: SowValidationOptions,
  ): SowValidationResult<PlayerState> {
    return validateSowSelection(this.player, selection.fields, options)
  }

  /** Validate a fence-build spec (edges + optional palisades). */
  canBuildFence(spec: FenceSpec): FenceValidationResult<PlayerState> {
    return validateFenceSelection(
      this.player,
      spec.edges,
      spec.palisadeEdges ?? [],
      spec.extraWood ?? 0,
      spec.freeFences ?? 0,
      spec.fenceSources === undefined
        ? (spec.options ?? {})
        : { ...(spec.options ?? {}), fenceSources: spec.fenceSources },
      spec.lockedKeys,
    )
  }

  /**
   * Validate a room-build selection. Accepts either a single tile or an
   * array of contiguous tiles (multi-room build, e.g. via construct.ts
   * with cards that reduce per-room cost).
   */
  canBuildRoom(
    rooms: FarmTilePosition | FarmTilePosition[],
    lockedKeys?: Set<string>,
  ): RoomSelectionResult {
    const list = Array.isArray(rooms) ? rooms : [rooms]
    return validateRoomSelection(this.player, list, lockedKeys)
  }

  /**
   * Validate a stable-build selection. Accepts either a single tile or
   * an array of tiles (multi-stable build via stables.ts with cards
   * granting extra stables in one action).
   */
  canBuildStable(
    stables: FarmTilePosition | FarmTilePosition[],
    lockedKeys?: Set<string>,
  ): StableSelectionResult {
    const list = Array.isArray(stables) ? stables : [stables]
    return validateStableSelection(this.player, list, lockedKeys)
  }

  /** Derived pasture view (projected from `player.pastures`). */
  pastures(): PastureView[] {
    return computePasturesFromFences(this.player)
  }

  /** Currently-placed fence edges (raw edge IDs). */
  emptyFences(): string[] {
    return (this.player.fenceSegments ?? []).map((s) => s.edge)
  }

  /**
   * Build farm-select interaction payload for a given farm-select kind.
   * Overloads narrow the return type so callers expecting an
   * `InteractionFarmSelection` (plow/sow/fence/room/stable) don't have
   * to widen to the `InteractionSelection` union just for the
   * `farm-position` case.
   */
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

  /** Extra sowable fields permitted by card effects (e.g. B72 pastures). */
  permittedExtraSowableFields(actionContext?: Record<string, unknown>) {
    return getPermittedExtraSowableFields(this.player, actionContext)
  }
}

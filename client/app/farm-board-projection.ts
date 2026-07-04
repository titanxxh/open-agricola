import type { ClientInteractionState } from '../../shared/contract/protocol/game'
import { ALL_ANIMAL_KEYS, type AnimalKey } from '../../shared/contract/animals'
import type {
  CropStack,
  FarmTilePosition,
  GameState,
  InteractionAnimalReorgZone,
  InteractionSelection,
  PlayerState,
} from '../../shared/contract/types'
import {
  getAdjacentTilesForEdge,
  getFarmyardBounds,
  getFarmyardTileKeySet,
  positionKey,
} from '../../shared/domain/farm'
import type { AnimalReorgState, PendingAnimalReorg } from '../types/ui'
import {
  buildBorrowedPlayedCardDisplays,
  buildCardDisplayMap,
  buildFarmCardDisplayMap,
  buildPastureDisplayMap,
  buildStableDisplayMap,
  computeReorgAvailableAnimals,
  type BorrowedPlayedCardDisplay,
  type CardAnimalDisplay,
} from './hooks/use-animal-reorg-flow'

export type FarmBoardProjectionCell = {
  key: string
  type: 'tile' | 'post' | 'fence-h' | 'fence-v' | 'void'
  tileRow?: number
  tileCol?: number
  fenceId?: string
}

export type FarmBoardProjectionFieldInfo = { stacks: CropStack[] }
export type FarmBoardProjectionAnimalDisplay = {
  animalType: AnimalKey | null
  animalCount: number
}
export type FarmBoardProjectionPastureTile = { pastureId: string; isCorner: boolean }
export type FarmBoardProjectionAnimalTotals = Record<AnimalKey, number>

export type FarmBoardProjection = {
  farmCells: FarmBoardProjectionCell[]
  farmGridColumns: number
  roomPositions: Set<string>
  fieldMap: Map<string, FarmBoardProjectionFieldInfo>
  stablePositions: Set<string>
  existingFenceSet: Set<string>
  pastureTiles: Map<string, FarmBoardProjectionPastureTile>
  pastureDisplayMap: Map<string, FarmBoardProjectionAnimalDisplay>
  pastureCapacityMap: Map<string, number>
  houseDisplay: FarmBoardProjectionAnimalDisplay
  stableDisplayMap: Map<string, FarmBoardProjectionAnimalDisplay>
  cardDisplayMap: Map<string, CardAnimalDisplay>
  farmCardDisplayMap: Map<string, CardAnimalDisplay>
  borrowedPlayedCardDisplays: BorrowedPlayedCardDisplay[]
  reorgRemaining: FarmBoardProjectionAnimalTotals | null
}

export type FarmBoardProjectionInput = {
  displayPlayer: PlayerState | null | undefined
  interaction: ClientInteractionState
  selectionInteraction: InteractionSelection | null | undefined
  players?: readonly Pick<PlayerState, 'id'>[]
  state?: GameState | null
  pastureCapacities?: Record<string, Record<string, number>>
  animalReorg?: AnimalReorgState | null
  pendingAnimalReorg?: PendingAnimalReorg | null
}

const emptyAnimalTotals = (): FarmBoardProjectionAnimalTotals =>
  ALL_ANIMAL_KEYS.reduce((acc, animal) => {
    acc[animal] = 0
    return acc
  }, {} as FarmBoardProjectionAnimalTotals)

const animalCountsTotal = (counts: Partial<Record<AnimalKey, number>>) =>
  ALL_ANIMAL_KEYS.reduce((sum, animal) => sum + Math.max(0, counts[animal] ?? 0), 0)

const zoneAnimalCounts = (zone: InteractionAnimalReorgZone) => {
  const counts = emptyAnimalTotals()
  for (const animal of ALL_ANIMAL_KEYS) {
    counts[animal] = Math.max(0, Math.floor(zone.animalCounts?.[animal] ?? 0))
  }
  if (animalCountsTotal(counts) > 0) return counts
  if (zone.animalType) counts[zone.animalType] = Math.max(0, Math.floor(zone.animalCount ?? 0))
  return counts
}

const addAnimalCounts = (
  target: FarmBoardProjectionAnimalTotals,
  counts: Partial<Record<AnimalKey, number>>,
) => {
  for (const animal of ALL_ANIMAL_KEYS) {
    target[animal] += counts[animal] ?? 0
  }
}

const buildFarmCells = (
  displayPlayer: PlayerState,
  interaction: ClientInteractionState,
  selectionInteraction: InteractionSelection | null | undefined,
  players: readonly Pick<PlayerState, 'id'>[],
) => {
  const bounds = { ...getFarmyardBounds(displayPlayer) }
  const tileKeys = new Set(getFarmyardTileKeySet(displayPlayer))
  const pendingSelectionTiles =
    interaction.stateId === 'wait' &&
    selectionInteraction?.kind === 'farm-position' &&
    players[interaction.playerIndex]?.id === displayPlayer.id
      ? selectionInteraction.selectablePositions
      : []
  pendingSelectionTiles.forEach((tile) => {
    tileKeys.add(positionKey(tile))
    bounds.minRow = Math.min(bounds.minRow, tile.row)
    bounds.maxRow = Math.max(bounds.maxRow, tile.row)
    bounds.minCol = Math.min(bounds.minCol, tile.col)
    bounds.maxCol = Math.max(bounds.maxCol, tile.col)
  })
  const rows = (bounds.maxRow - bounds.minRow + 1) * 2 + 1
  const cols = (bounds.maxCol - bounds.minCol + 1) * 2 + 1
  const cells: FarmBoardProjectionCell[] = []
  const hasAdjacentTileForPost = (boundaryRow: number, boundaryCol: number) =>
    [
      { row: boundaryRow - 1, col: boundaryCol - 1 },
      { row: boundaryRow - 1, col: boundaryCol },
      { row: boundaryRow, col: boundaryCol - 1 },
      { row: boundaryRow, col: boundaryCol },
    ].some((tile) => tileKeys.has(positionKey(tile)))
  const hasAdjacentTileForEdge = (edgeId: string) =>
    getAdjacentTilesForEdge(edgeId).some((tile: FarmTilePosition) =>
      tileKeys.has(positionKey(tile)),
    )
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const isTile = row % 2 === 1 && col % 2 === 1
    const isPost = row % 2 === 0 && col % 2 === 0
    const isFenceH = row % 2 === 0 && col % 2 === 1
    const isFenceV = row % 2 === 1 && col % 2 === 0
    const tileRow = isTile ? bounds.minRow + (row - 1) / 2 : undefined
    const tileCol = isTile ? bounds.minCol + (col - 1) / 2 : undefined
    const boundaryRow = bounds.minRow + row / 2
    const boundaryCol = bounds.minCol + col / 2
    const fenceId = isFenceH
      ? `H-${boundaryRow}-${bounds.minCol + (col - 1) / 2}`
      : isFenceV
        ? `V-${bounds.minRow + (row - 1) / 2}-${boundaryCol}`
        : undefined
    const type =
      isTile
        ? tileKeys.has(positionKey({ row: tileRow!, col: tileCol! })) ? 'tile' : 'void'
        : isFenceH || isFenceV
          ? fenceId && hasAdjacentTileForEdge(fenceId)
            ? isFenceH ? 'fence-h' : 'fence-v'
            : 'void'
          : isPost && hasAdjacentTileForPost(boundaryRow, boundaryCol)
            ? 'post'
            : 'void'
    cells.push({
      key: `${row}-${col}`,
      type,
      tileRow,
      tileCol,
      fenceId,
    })
  }
  return { cells, columns: cols }
}

const buildPastureTiles = (displayPlayer: PlayerState | null | undefined) => {
  const map = new Map<string, FarmBoardProjectionPastureTile>()
  ;(displayPlayer?.pastures ?? []).forEach((pasture) => {
    if (!pasture.tiles || pasture.tiles.length === 0) return
    let corner = pasture.tiles[0]
    pasture.tiles.forEach((tile) => {
      if (tile.row > corner.row || (tile.row === corner.row && tile.col > corner.col)) corner = tile
    })
    const cornerKey = positionKey(corner)
    pasture.tiles.forEach((tile) => {
      map.set(positionKey(tile), { pastureId: pasture.id, isCorner: positionKey(tile) === cornerKey })
    })
  })
  return map
}

const buildPastureCapacityMap = (
  displayPlayer: PlayerState | null | undefined,
  pastureCapacities: Record<string, Record<string, number>>,
) => {
  const map = new Map<string, number>()
  ;(displayPlayer?.pastures ?? []).forEach((pasture) => {
    if (pasture.tiles.length > 0) {
      map.set(pasture.id, pastureCapacities[displayPlayer?.id ?? '']?.[pasture.id] ?? 0)
    }
  })
  return map
}

const buildHouseDisplay = (
  displayPlayer: PlayerState | null | undefined,
  animalReorg: AnimalReorgState | null | undefined,
): FarmBoardProjectionAnimalDisplay => {
  if (animalReorg) {
    const zone = animalReorg.zones.find((entry) => entry.zoneType === 'house')
    return {
      animalType: zone?.animalType ?? null,
      animalCount: zone?.animalCount ?? 0,
    }
  }
  return {
    animalType: displayPlayer?.houseAnimalType ?? null,
    animalCount: displayPlayer?.houseAnimalCount ?? 0,
  }
}

const buildReorgRemaining = (
  state: GameState | null | undefined,
  pendingAnimalReorg: PendingAnimalReorg | null | undefined,
  animalReorg: AnimalReorgState | null | undefined,
) => {
  if (!state) return null
  const playerIndex = pendingAnimalReorg?.playerIndex ?? state.currentPlayerIndex
  const player = state.players[playerIndex]
  if (!player) return null
  const available = computeReorgAvailableAnimals(player)
  const totals = animalReorg?.zones.reduce((acc, zone) => {
    addAnimalCounts(acc, zoneAnimalCounts(zone))
    return acc
  }, emptyAnimalTotals()) ?? emptyAnimalTotals()
  return ALL_ANIMAL_KEYS.reduce((acc, animal) => {
    acc[animal] = Math.max(0, available[animal] - totals[animal])
    return acc
  }, emptyAnimalTotals())
}

export const buildFarmBoardProjection = ({
  displayPlayer,
  interaction,
  selectionInteraction,
  players = [],
  state,
  pastureCapacities = {},
  animalReorg,
  pendingAnimalReorg,
}: FarmBoardProjectionInput): FarmBoardProjection => {
  const roomPositions = new Set(
    (displayPlayer?.roomTiles ?? []).map((pos: FarmTilePosition) => positionKey(pos)),
  )
  const fieldMap = new Map<string, FarmBoardProjectionFieldInfo>()
  ;(displayPlayer?.fields ?? []).forEach((field) => {
    fieldMap.set(positionKey({ row: field.row, col: field.col }), { stacks: field.stacks })
  })
  const stablePositions = new Set(
    (displayPlayer?.stableTiles ?? []).map((pos: FarmTilePosition) => positionKey(pos)),
  )
  const existingFenceSet = new Set((displayPlayer?.fenceSegments ?? []).map((segment) => segment.edge))
  const pastureTiles = buildPastureTiles(displayPlayer)
  const pastureDisplayMap = buildPastureDisplayMap(displayPlayer, animalReorg)
  const pastureCapacityMap = buildPastureCapacityMap(displayPlayer, pastureCapacities)
  const houseDisplay = buildHouseDisplay(displayPlayer, animalReorg)
  const stableDisplayMap = buildStableDisplayMap(displayPlayer, animalReorg)
  const cardDisplayMap = buildCardDisplayMap(displayPlayer, animalReorg)
  const farmCardDisplayMap = buildFarmCardDisplayMap(displayPlayer, animalReorg)
  const borrowedPlayedCardDisplays = buildBorrowedPlayedCardDisplays(state, displayPlayer, animalReorg)
  const reorgRemaining = buildReorgRemaining(state, pendingAnimalReorg, animalReorg)
  if (!displayPlayer) {
    return {
      farmCells: [],
      farmGridColumns: 11,
      roomPositions,
      fieldMap,
      stablePositions,
      existingFenceSet,
      pastureTiles,
      pastureDisplayMap,
      pastureCapacityMap,
      houseDisplay,
      stableDisplayMap,
      cardDisplayMap,
      farmCardDisplayMap,
      borrowedPlayedCardDisplays,
      reorgRemaining,
    }
  }
  const farmGrid = buildFarmCells(displayPlayer, interaction, selectionInteraction, players)
  return {
    farmCells: farmGrid.cells,
    farmGridColumns: farmGrid.columns,
    roomPositions,
    fieldMap,
    stablePositions,
    existingFenceSet,
    pastureTiles,
    pastureDisplayMap,
    pastureCapacityMap,
    houseDisplay,
    stableDisplayMap,
    cardDisplayMap,
    farmCardDisplayMap,
    borrowedPlayedCardDisplays,
    reorgRemaining,
  }
}

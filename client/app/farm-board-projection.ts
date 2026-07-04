import type { ClientInteractionState } from '../../shared/contract/protocol/game'
import type {
  CropStack,
  FarmTilePosition,
  InteractionSelection,
  PlayerState,
} from '../../shared/contract/types'
import {
  getAdjacentTilesForEdge,
  getFarmyardBounds,
  getFarmyardTileKeySet,
  positionKey,
} from '../../shared/domain/farm'

export type FarmBoardProjectionCell = {
  key: string
  type: 'tile' | 'post' | 'fence-h' | 'fence-v' | 'void'
  tileRow?: number
  tileCol?: number
  fenceId?: string
}

export type FarmBoardProjectionFieldInfo = { stacks: CropStack[] }

export type FarmBoardProjection = {
  farmCells: FarmBoardProjectionCell[]
  farmGridColumns: number
  roomPositions: Set<string>
  fieldMap: Map<string, FarmBoardProjectionFieldInfo>
  stablePositions: Set<string>
  existingFenceSet: Set<string>
}

export type FarmBoardProjectionInput = {
  displayPlayer: PlayerState | null | undefined
  interaction: ClientInteractionState
  selectionInteraction: InteractionSelection | null | undefined
  players?: readonly Pick<PlayerState, 'id'>[]
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

export const buildFarmBoardProjection = ({
  displayPlayer,
  interaction,
  selectionInteraction,
  players = [],
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
  if (!displayPlayer) {
    return {
      farmCells: [],
      farmGridColumns: 11,
      roomPositions,
      fieldMap,
      stablePositions,
      existingFenceSet,
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
  }
}

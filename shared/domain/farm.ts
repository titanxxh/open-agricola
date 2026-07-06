import type { FarmTilePosition, FarmyardExtension, Field, PlayerState } from '../contract/types'
import {
  countUnusedFarmyardSpaces as countCanonicalUnusedFarmyardSpaces,
  getUsedFarmyardTileKeys as getCanonicalUsedFarmyardTileKeys,
  hasNoUnusedFarmyardSpaces as hasCanonicalNoUnusedFarmyardSpaces,
} from './farmyard-usage-core'
import {
  FARM_COLS,
  FARM_ROWS,
  getFarmyardTilePositions,
  parseEdgeId,
  positionKey,
} from './farmyard-geometry'

export {
  FARM_COLS,
  FARM_ROWS,
  createDefaultRoomTiles,
  getAdjacentTilesForEdge,
  getAllTilePositions,
  getFarmyardBounds,
  getFarmyardEdgeIds,
  getFarmyardTileCount,
  getFarmyardTileKeySet,
  getFarmyardTilePositions,
  isFarmyardBorderEdge,
  isFarmyardEdge,
  isWithinFarmyard,
  normalizeFarmyardExtensions,
  parseEdgeId,
  parsePositionKey,
  positionKey,
  type FarmyardGeometrySource,
} from './farmyard-geometry'

export const getUsedFarmyardTileKeys = (player: PlayerState) =>
  getCanonicalUsedFarmyardTileKeys(player)

export const countUnusedFarmyardSpaces = (player: PlayerState) =>
  countCanonicalUnusedFarmyardSpaces(player)

export const hasNoUnusedFarmyardSpaces = (player: PlayerState) =>
  hasCanonicalNoUnusedFarmyardSpaces(player)

const getNextEmptyTile = (
  roomTiles: FarmTilePosition[],
  fields: Field[],
  stableTiles: FarmTilePosition[] = [],
  farmTerrain: FarmTilePosition[] = [],
  farmyardExtensions: FarmyardExtension[] = [],
) => {
  const used = new Set<string>()
  roomTiles.forEach((tile) => used.add(positionKey(tile)))
  farmTerrain.forEach((tile) => used.add(positionKey(tile)))
  fields.forEach((field) =>
    used.add(positionKey({ row: field.row, col: field.col })),
  )
  stableTiles.forEach((tile) => used.add(positionKey(tile)))
  return getFarmyardTilePositions({ farmyardExtensions }).find(
    (pos) => !used.has(positionKey(pos)),
  )
}

export const getNextEmptyTileForPlayer = (player: PlayerState) =>
  getNextEmptyTile(
    player.roomTiles,
    player.fields,
    player.stableTiles,
    player.farmTerrain ?? [],
    player.farmyardExtensions ?? [],
  )

export const isBorderEdge = (edgeId: string): boolean => {
  const parsed = parseEdgeId(edgeId)
  if (!parsed) return false
  if (parsed.type === 'H') {
    const r = parsed.row
    const c = parsed.col
    if (c < 0 || c >= FARM_COLS) return false
    return r === 0 || r === FARM_ROWS
  }
  if (parsed.type === 'V') {
    const r = parsed.row
    const c = parsed.col
    if (r < 0 || r >= FARM_ROWS) return false
    return c === 0 || c === FARM_COLS
  }
  return false
}

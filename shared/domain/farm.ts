import type { FarmTilePosition, FarmyardExtension, Field, PlayerState } from '../contract/types'
import {
  countUnusedFarmyardSpaces as countCanonicalUnusedFarmyardSpaces,
  getUsedFarmyardTileKeys as getCanonicalUsedFarmyardTileKeys,
} from './farmyard-usage'

export const FARM_ROWS = 3
export const FARM_COLS = 5
export type FarmyardGeometrySource = Pick<PlayerState, 'farmyardExtensions'> | undefined

export const getAllTilePositions = (): FarmTilePosition[] => {
  const positions: FarmTilePosition[] = []
  for (let row = 0; row < FARM_ROWS; row += 1) {
    for (let col = 0; col < FARM_COLS; col += 1) {
      positions.push({ row, col })
    }
  }
  return positions
}

export const createDefaultRoomTiles = (rooms: number) => {
  const positions: FarmTilePosition[] = []
  for (let col = 0; col < FARM_COLS; col += 1) {
    for (let row = FARM_ROWS - 1; row >= 0; row -= 1) {
      positions.push({ row, col })
    }
  }
  return positions.slice(0, Math.max(0, rooms))
}

export const positionKey = (pos: FarmTilePosition) => `${pos.row}-${pos.col}`

export const parsePositionKey = (key: string): FarmTilePosition | null => {
  const match = /^(-?\d+)-(-?\d+)$/.exec(key)
  if (!match) return null
  const row = Number(match[1])
  const col = Number(match[2])
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null
  return { row, col }
}

export const normalizeFarmyardExtensions = (
  extensions?: FarmyardExtension[],
): FarmyardExtension[] => {
  if (!Array.isArray(extensions)) return []
  const occupied = new Set(getAllTilePositions().map(positionKey))
  const normalized: FarmyardExtension[] = []
  extensions.forEach((extension, index) => {
    if (!extension || !Array.isArray(extension.tiles)) return
    const tiles: FarmTilePosition[] = []
    const local = new Set<string>()
    for (const tile of extension.tiles) {
      const row = Number((tile as FarmTilePosition | undefined)?.row)
      const col = Number((tile as FarmTilePosition | undefined)?.col)
      if (!Number.isInteger(row) || !Number.isInteger(col)) continue
      const pos = { row, col }
      const key = positionKey(pos)
      if (occupied.has(key) || local.has(key)) continue
      local.add(key)
      tiles.push(pos)
    }
    if (tiles.length === 0) return
    tiles.forEach((tile) => occupied.add(positionKey(tile)))
    normalized.push({
      id: typeof extension.id === 'string' && extension.id.length > 0
        ? extension.id
        : `farmyard-extension-${index + 1}`,
      ...(typeof extension.sourceCardId === 'string'
        ? { sourceCardId: extension.sourceCardId }
        : {}),
      tiles,
    })
  })
  return normalized
}

export const getFarmyardTilePositions = (
  player?: FarmyardGeometrySource,
): FarmTilePosition[] => {
  const positions = getAllTilePositions()
  const seen = new Set(positions.map(positionKey))
  for (const extension of player?.farmyardExtensions ?? []) {
    for (const tile of extension.tiles ?? []) {
      const key = positionKey(tile)
      if (seen.has(key)) continue
      positions.push({ row: tile.row, col: tile.col })
      seen.add(key)
    }
  }
  return positions
}

export const getFarmyardTileKeySet = (player?: FarmyardGeometrySource) =>
  new Set(getFarmyardTilePositions(player).map(positionKey))

export const isWithinFarmyard = (
  player: FarmyardGeometrySource,
  pos: FarmTilePosition,
) => getFarmyardTileKeySet(player).has(positionKey(pos))

export const getFarmyardTileCount = (player?: FarmyardGeometrySource) =>
  getFarmyardTilePositions(player).length

export const getFarmyardBounds = (player?: FarmyardGeometrySource) => {
  const positions = getFarmyardTilePositions(player)
  const rows = positions.map((pos) => pos.row)
  const cols = positions.map((pos) => pos.col)
  return {
    minRow: Math.min(...rows),
    maxRow: Math.max(...rows),
    minCol: Math.min(...cols),
    maxCol: Math.max(...cols),
  }
}

export const parseEdgeId = (edgeId: string) => {
  const match = /^([HV])-(-?\d+)-(-?\d+)$/.exec(edgeId)
  if (!match) return null
  const row = Number(match[2])
  const col = Number(match[3])
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null
  return { type: match[1] as 'H' | 'V', row, col }
}

export const getAdjacentTilesForEdge = (edgeId: string): FarmTilePosition[] => {
  const parsed = parseEdgeId(edgeId)
  if (!parsed) return []
  if (parsed.type === 'H') {
    return [
      { row: parsed.row - 1, col: parsed.col },
      { row: parsed.row, col: parsed.col },
    ]
  }
  return [
    { row: parsed.row, col: parsed.col - 1 },
    { row: parsed.row, col: parsed.col },
  ]
}

export const isFarmyardEdge = (
  player: FarmyardGeometrySource,
  edgeId: string,
): boolean => {
  const parsed = parseEdgeId(edgeId)
  if (!parsed) return false
  const tileSet = getFarmyardTileKeySet(player)
  return getAdjacentTilesForEdge(edgeId).some((tile) =>
    tileSet.has(positionKey(tile)),
  )
}

export const isFarmyardBorderEdge = (
  player: FarmyardGeometrySource,
  edgeId: string,
): boolean => {
  const parsed = parseEdgeId(edgeId)
  if (!parsed) return false
  const tileSet = getFarmyardTileKeySet(player)
  const adjacent = getAdjacentTilesForEdge(edgeId)
  const insideCount = adjacent.filter((tile) =>
    tileSet.has(positionKey(tile)),
  ).length
  return insideCount === 1
}

export const getFarmyardEdgeIds = (player?: FarmyardGeometrySource): string[] => {
  const edgeIds = new Set<string>()
  for (const tile of getFarmyardTilePositions(player)) {
    edgeIds.add(`H-${tile.row}-${tile.col}`)
    edgeIds.add(`H-${tile.row + 1}-${tile.col}`)
    edgeIds.add(`V-${tile.row}-${tile.col}`)
    edgeIds.add(`V-${tile.row}-${tile.col + 1}`)
  }
  return Array.from(edgeIds)
}

export const getUsedFarmyardTileKeys = (player: PlayerState) =>
  getCanonicalUsedFarmyardTileKeys(player)

export const countUnusedFarmyardSpaces = (player: PlayerState) =>
  countCanonicalUnusedFarmyardSpaces(player)

export const hasNoUnusedFarmyardSpaces = (player: PlayerState) =>
  countUnusedFarmyardSpaces(player) === 0

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

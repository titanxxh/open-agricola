import type { FarmTilePosition, Field, PlayerState } from './types'

export const FARM_ROWS = 3
export const FARM_COLS = 5

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

export const getUsedFarmyardTileKeys = (player: PlayerState) => {
  const used = new Set<string>()
  player.roomTiles.forEach((tile) => used.add(positionKey(tile)))
  player.fields.forEach((field) =>
    used.add(positionKey({ row: field.row, col: field.col })),
  )
  player.stableTiles.forEach((tile) => used.add(positionKey(tile)))
  player.pastures.forEach((pasture) =>
    pasture.tiles.forEach((tile) => used.add(positionKey(tile))),
  )
  return used
}

export const countUnusedFarmyardSpaces = (player: PlayerState) =>
  FARM_ROWS * FARM_COLS - getUsedFarmyardTileKeys(player).size

export const hasNoUnusedFarmyardSpaces = (player: PlayerState) =>
  countUnusedFarmyardSpaces(player) === 0

const getNextEmptyTile = (
  roomTiles: FarmTilePosition[],
  fields: Field[],
  stableTiles: FarmTilePosition[] = [],
) => {
  const used = new Set<string>()
  roomTiles.forEach((tile) => used.add(positionKey(tile)))
  fields.forEach((field) =>
    used.add(positionKey({ row: field.row, col: field.col })),
  )
  stableTiles.forEach((tile) => used.add(positionKey(tile)))
  return getAllTilePositions().find(
    (pos) => !used.has(positionKey(pos)),
  )
}

export const getNextEmptyTileForPlayer = (player: PlayerState) =>
  getNextEmptyTile(player.roomTiles, player.fields, player.stableTiles)

export const isBorderEdge = (edgeId: string): boolean => {
  const match = /^([HV])-(\d+)-(\d+)$/.exec(edgeId)
  if (!match) return false
  const type = match[1]
  const r = Number(match[2])
  const c = Number(match[3])
  if (!Number.isFinite(r) || !Number.isFinite(c)) return false
  if (type === 'H') {
    if (c < 0 || c >= FARM_COLS) return false
    return r === 0 || r === FARM_ROWS
  }
  if (type === 'V') {
    if (r < 0 || r >= FARM_ROWS) return false
    return c === 0 || c === FARM_COLS
  }
  return false
}

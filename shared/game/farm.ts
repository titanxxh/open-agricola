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

export const getNextEmptyTile = (
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

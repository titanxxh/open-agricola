import type { FarmTilePosition, PlayerState } from '../contract/types'
import { FARM_COLS, FARM_ROWS, positionKey } from '../domain/farm'

export type FencedTerrainAdjacencyCounts = {
  forestField: number
  forestMoor: number
}

type VisibleTileKind = 'field' | 'forest' | 'moor'

const adjacentTilesForEdge = (edge: string): [FarmTilePosition, FarmTilePosition] | null => {
  const match = /^([HV])-(\d+)-(\d+)$/.exec(edge)
  if (!match) return null
  const axis = match[1]
  const row = Number(match[2])
  const col = Number(match[3])
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null
  if (axis === 'H') {
    if (row <= 0 || row >= FARM_ROWS || col < 0 || col >= FARM_COLS) return null
    return [{ row: row - 1, col }, { row, col }]
  }
  if (row < 0 || row >= FARM_ROWS || col <= 0 || col >= FARM_COLS) return null
  return [{ row, col: col - 1 }, { row, col }]
}

export const countFencedTerrainAdjacencies = (
  player: Pick<PlayerState, 'fields' | 'farmTerrain' | 'fenceSegments'>,
): FencedTerrainAdjacencyCounts => {
  const fieldKeys = new Set(player.fields.map((field) => positionKey(field)))
  const terrainByKey = new Map((player.farmTerrain ?? []).map((tile) => [positionKey(tile), tile.kind]))
  const kindAt = (tile: FarmTilePosition): VisibleTileKind | undefined => {
    const key = positionKey(tile)
    if (fieldKeys.has(key)) return 'field'
    return terrainByKey.get(key)
  }
  const counts = { forestField: 0, forestMoor: 0 }
  const seen = new Set<string>()
  for (const segment of player.fenceSegments) {
    if (segment.type !== 'fence' || seen.has(segment.edge)) continue
    seen.add(segment.edge)
    const adjacent = adjacentTilesForEdge(segment.edge)
    if (!adjacent) continue
    const [left, right] = adjacent.map(kindAt)
    if ((left === 'forest' && right === 'field') || (left === 'field' && right === 'forest')) {
      counts.forestField += 1
    } else if ((left === 'forest' && right === 'moor') || (left === 'moor' && right === 'forest')) {
      counts.forestMoor += 1
    }
  }
  return counts
}

import type { FarmTilePosition, PlayerState } from '../contract/types'
import { getAdjacentTilesForEdge, getFarmyardTileKeySet, positionKey } from '../domain/farm'

export type FencedTerrainAdjacencyCounts = {
  forestField: number
  forestMoor: number
}

type VisibleTileKind = 'field' | 'forest' | 'moor'

export const countFencedTerrainAdjacencies = (
  player: Pick<PlayerState, 'fields' | 'farmTerrain' | 'fenceSegments' | 'farmyardExtensions'>,
): FencedTerrainAdjacencyCounts => {
  const farmyardKeys = getFarmyardTileKeySet(player)
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
    const adjacent = getAdjacentTilesForEdge(segment.edge)
    if (
      adjacent.length !== 2 ||
      adjacent.some((tile) => !farmyardKeys.has(positionKey(tile)))
    ) {
      continue
    }
    const [left, right] = adjacent.map(kindAt)
    if ((left === 'forest' && right === 'field') || (left === 'field' && right === 'forest')) {
      counts.forestField += 1
    } else if ((left === 'forest' && right === 'moor') || (left === 'moor' && right === 'forest')) {
      counts.forestMoor += 1
    }
  }
  return counts
}

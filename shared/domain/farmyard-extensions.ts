import type { FarmTilePosition, PlayerState } from '../contract/types'
import {
  getFarmyardTileKeySet,
  getFarmyardTilePositions,
  positionKey,
} from './farm'

const directions = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
] as const

const adjacent = (a: FarmTilePosition, b: FarmTilePosition) =>
  Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1

const normalizeTwoTiles = (tiles: FarmTilePosition[]) => {
  const byKey = new Map<string, FarmTilePosition>()
  for (const tile of tiles) {
    if (!Number.isInteger(tile.row) || !Number.isInteger(tile.col)) continue
    byKey.set(positionKey(tile), { row: tile.row, col: tile.col })
  }
  if (byKey.size !== 2) return null
  return [...byKey.values()].sort((a, b) => a.row - b.row || a.col - b.col)
}

export const isValidFarmyardExtensionTiles = (
  player: Pick<PlayerState, 'farmyardExtensions'>,
  tiles: FarmTilePosition[],
) => {
  const selected = normalizeTwoTiles(tiles)
  if (!selected) return false
  const existing = getFarmyardTileKeySet(player)
  if (selected.some((tile) => existing.has(positionKey(tile)))) return false
  if (!adjacent(selected[0]!, selected[1]!)) return false
  return directions.some((dir) =>
    selected.every((tile) =>
      existing.has(positionKey({ row: tile.row + dir.dr, col: tile.col + dir.dc })),
    ),
  )
}

export const getFarmyardExtensionCandidates = (
  player: Pick<PlayerState, 'farmyardExtensions'>,
): FarmTilePosition[][] => {
  const existing = getFarmyardTileKeySet(player)
  const candidateMap = new Map<string, FarmTilePosition>()
  for (const tile of getFarmyardTilePositions(player)) {
    for (const dir of directions) {
      const next = { row: tile.row + dir.dr, col: tile.col + dir.dc }
      const key = positionKey(next)
      if (!existing.has(key)) candidateMap.set(key, next)
    }
  }
  const candidates = [...candidateMap.values()]
  const groups = new Map<string, FarmTilePosition[]>()
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const pair = [candidates[i]!, candidates[j]!]
      if (!isValidFarmyardExtensionTiles(player, pair)) continue
      const normalized = normalizeTwoTiles(pair)!
      groups.set(normalized.map(positionKey).join('|'), normalized)
    }
  }
  return [...groups.values()]
}

export const addFarmyardExtension = (
  player: PlayerState,
  sourceCardId: string,
  tiles: FarmTilePosition[],
) => {
  const normalized = normalizeTwoTiles(tiles)
  if (!normalized || !isValidFarmyardExtensionTiles(player, normalized)) return false
  const index = (player.farmyardExtensions ?? []).length + 1
  player.farmyardExtensions = [
    ...(player.farmyardExtensions ?? []),
    {
      id: `${sourceCardId}-${index}`,
      sourceCardId,
      tiles: normalized,
    },
  ]
  return true
}

import type { FarmTilePosition, Field, PlayerState } from '../contract/types'
import { FARM_COLS, FARM_ROWS, positionKey } from '../domain/farm'
import type { FarmTerrainKind, FarmTerrainTile } from './types'

export const normalizeFarmTerrain = (input: unknown): FarmTerrainTile[] => {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  return input.flatMap((entry): FarmTerrainTile[] => {
    if (!entry || typeof entry !== 'object') return []
    const raw = entry as { row?: unknown; col?: unknown; kind?: unknown }
    const row = Number(raw.row)
    const col = Number(raw.col)
    if (!Number.isInteger(row) || !Number.isInteger(col)) return []
    if (row < 0 || row >= FARM_ROWS || col < 0 || col >= FARM_COLS) return []
    if (raw.kind !== 'forest' && raw.kind !== 'moor') return []
    const key = `${row}-${col}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ row, col, kind: raw.kind }]
  })
}

export const getFarmTerrainTileKeys = (player: Pick<PlayerState, 'farmTerrain'>): Set<string> =>
  new Set((player.farmTerrain ?? []).map((tile) => positionKey(tile)))

const hasAdjacentField = (fields: readonly Field[], tile: FarmTilePosition): boolean => {
  const fieldKeys = new Set(fields.map((field) => positionKey(field)))
  return [
    { row: tile.row - 1, col: tile.col },
    { row: tile.row + 1, col: tile.col },
    { row: tile.row, col: tile.col - 1 },
    { row: tile.row, col: tile.col + 1 },
  ].some((neighbor) => fieldKeys.has(positionKey(neighbor)))
}

export type ReplaceTerrainWithFieldResult =
  | { ok: true }
  | { ok: false; code: 'NO_TERRAIN' | 'WRONG_TERRAIN' | 'NOT_ADJACENT' }

export const replaceTerrainWithField = (
  player: PlayerState,
  tile: FarmTilePosition,
  terrainKind: FarmTerrainKind,
): ReplaceTerrainWithFieldResult => {
  const key = positionKey(tile)
  const index = (player.farmTerrain ?? []).findIndex((entry) => positionKey(entry) === key)
  if (index < 0) return { ok: false, code: 'NO_TERRAIN' }
  if (player.farmTerrain![index]!.kind !== terrainKind) return { ok: false, code: 'WRONG_TERRAIN' }
  if ((player.fields ?? []).length > 0 && !hasAdjacentField(player.fields, tile)) {
    return { ok: false, code: 'NOT_ADJACENT' }
  }
  player.farmTerrain = player.farmTerrain!.filter((_, idx) => idx !== index)
  player.fields = [
    ...(player.fields ?? []),
    { row: tile.row, col: tile.col, stacks: [] },
  ]
  return { ok: true }
}

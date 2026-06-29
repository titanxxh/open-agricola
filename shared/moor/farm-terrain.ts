import type { FarmTilePosition, Field, PlayerState } from '../contract/types'
import { isWithinFarmyard, positionKey } from '../domain/farm'
import type { FarmTerrainKind, FarmTerrainTile } from './types'

const isTerrainKind = (value: unknown): value is FarmTerrainKind =>
  value === 'forest' || value === 'moor'

export const normalizeFarmTerrain = (
  input: unknown,
  player?: Pick<PlayerState, 'farmyardExtensions'>,
): FarmTerrainTile[] => {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  return input.flatMap((entry): FarmTerrainTile[] => {
    if (!entry || typeof entry !== 'object') return []
    const raw = entry as { row?: unknown; col?: unknown; kind?: unknown; covered?: unknown }
    const row = Number(raw.row)
    const col = Number(raw.col)
    if (!Number.isInteger(row) || !Number.isInteger(col)) return []
    if (!isWithinFarmyard(player, { row, col })) return []
    if (!isTerrainKind(raw.kind)) return []
    const key = `${row}-${col}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{
      row,
      col,
      kind: raw.kind,
      ...(isTerrainKind(raw.covered) ? { covered: raw.covered } : {}),
    }]
  })
}

export const getFarmTerrainTileKeys = (player: Pick<PlayerState, 'farmTerrain'>): Set<string> =>
  new Set((player.farmTerrain ?? []).map((tile) => positionKey(tile)))

export const getVisibleTerrainTiles = (
  player: Pick<PlayerState, 'farmTerrain'>,
  kind?: FarmTerrainKind,
): FarmTilePosition[] =>
  (player.farmTerrain ?? [])
    .filter((tile) => kind === undefined || tile.kind === kind)
    .map(({ row, col }) => ({ row, col }))

export const getVisibleFarmTerrain = (
  player: Pick<PlayerState, 'farmTerrain'>,
  tile: FarmTilePosition | undefined,
): FarmTerrainTile | undefined => {
  if (!tile) return undefined
  const key = positionKey(tile)
  return (player.farmTerrain ?? []).find((entry) => positionKey(entry) === key)
}

export const hasVisibleTerrain = (
  player: Pick<PlayerState, 'farmTerrain'>,
  tile: FarmTilePosition | undefined,
  kind: FarmTerrainKind,
): boolean =>
  getVisibleFarmTerrain(player, tile)?.kind === kind

export const hasVisibleTerrainWithoutCovered = (
  player: Pick<PlayerState, 'farmTerrain'>,
  tile: FarmTilePosition | undefined,
  kind: FarmTerrainKind,
): boolean => {
  const entry = getVisibleFarmTerrain(player, tile)
  return entry?.kind === kind && entry.covered === undefined
}

export const coverVisibleTerrain = (
  player: PlayerState,
  tile: FarmTilePosition,
  fromKind: FarmTerrainKind,
  toKind: FarmTerrainKind,
): boolean => {
  const entry = getVisibleFarmTerrain(player, tile)
  if (!entry || entry.kind !== fromKind || entry.covered !== undefined) return false
  entry.covered = entry.kind
  entry.kind = toKind
  return true
}

export const removeVisibleTerrain = (
  player: PlayerState,
  tile: FarmTilePosition | undefined,
  kind: FarmTerrainKind,
): { ok: true; cleared: boolean; revealed?: FarmTerrainKind } | { ok: false } => {
  if (!tile) return { ok: false }
  const key = positionKey(tile)
  const index = (player.farmTerrain ?? []).findIndex((entry) => positionKey(entry) === key)
  if (index < 0) return { ok: false }
  const entry = player.farmTerrain![index]!
  if (entry.kind !== kind) return { ok: false }
  if (entry.covered !== undefined) {
    player.farmTerrain![index] = { row: entry.row, col: entry.col, kind: entry.covered }
    return { ok: true, cleared: false, revealed: entry.covered }
  }
  player.farmTerrain = player.farmTerrain!.filter((_, idx) => idx !== index)
  return { ok: true, cleared: true }
}

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
  if (player.farmTerrain![index]!.covered !== undefined) return { ok: false, code: 'WRONG_TERRAIN' }
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

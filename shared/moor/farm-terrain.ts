import type { FarmOperationResult, FarmTerrainChange, FarmTilePosition, Field, PlayerState } from '../contract/types'
import type { DraftGameEvent } from '../contract/events'
import { commitFarmOperation, type FarmOperation } from '../domain/farm-operations'
import { getUsedFarmyardTileKeys } from '../domain/farmyard-usage'
import { getPlacementBlockedFarmyardSpaceKeys } from '../domain/farmyard-space-states'
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

export type TerrainOperation = {
  positions: readonly FarmTilePosition[]
  sourceCardId?: string
} & (
  | { mode: 'place'; kind: FarmTerrainKind }
  | { mode: 'remove'; kind: FarmTerrainKind }
  | { mode: 'replace-kind'; fromKind: FarmTerrainKind; toKind: FarmTerrainKind }
  | { mode: 'cover'; fromKind: FarmTerrainKind; toKind: FarmTerrainKind }
  | { mode: 'replace-with-field'; fromKind: FarmTerrainKind }
)

type TerrainPlan =
  | { ok: true; operation: Extract<FarmOperation, { kind: 'terrain' }> }
  | { ok: false; code: 'INVALID_POSITION' | 'DUPLICATE_POSITION' | 'OCCUPIED' | 'NO_TERRAIN' | 'WRONG_TERRAIN' | 'NOT_ADJACENT' }

const hasAdjacentField = (fields: readonly Field[], tile: FarmTilePosition): boolean => {
  const fieldKeys = new Set(fields.map(positionKey))
  return [{ row: tile.row - 1, col: tile.col }, { row: tile.row + 1, col: tile.col },
    { row: tile.row, col: tile.col - 1 }, { row: tile.row, col: tile.col + 1 }]
    .some(neighbor => fieldKeys.has(positionKey(neighbor)))
}

/** Validate and prepare the whole ordered batch without writing live state. */
export function planTerrainOperation(player: PlayerState, request: TerrainOperation): TerrainPlan {
  let terrain = (player.farmTerrain ?? []).map(tile => ({ ...tile }))
  const fields = player.fields.map(field => ({ ...field, stacks: field.stacks.map(stack => ({ ...stack })) }))
  const used = getUsedFarmyardTileKeys(player)
  const blocked = getPlacementBlockedFarmyardSpaceKeys(player)
  const seen = new Set<string>()
  const changes: FarmTerrainChange[] = []
  for (const selected of request.positions) {
    const position = { row: selected.row, col: selected.col }
    if (!Number.isInteger(position.row) || !Number.isInteger(position.col) || !isWithinFarmyard(player, position)) return { ok: false, code: 'INVALID_POSITION' }
    const key = positionKey(position)
    if (seen.has(key)) return { ok: false, code: 'DUPLICATE_POSITION' }
    seen.add(key)
    const index = terrain.findIndex(tile => positionKey(tile) === key)
    const tile = terrain[index]
    const before = tile ? { kind: tile.kind, ...(tile.covered ? { covered: tile.covered } : {}) } : null
    let after: FarmTerrainChange['after']
    let fieldCreated = false
    if (request.mode === 'place') {
      if (used.has(key) || blocked.has(key)) return { ok: false, code: 'OCCUPIED' }
      after = { kind: request.kind }
      terrain.push({ ...position, ...after })
      used.add(key)
    } else {
      if (!tile) return { ok: false, code: 'NO_TERRAIN' }
      const fromKind = request.mode === 'remove' ? request.kind : request.fromKind
      if (tile.kind !== fromKind) return { ok: false, code: 'WRONG_TERRAIN' }
      switch (request.mode) {
        case 'remove':
          after = tile.covered ? { kind: tile.covered } : null
          if (after) terrain[index] = { ...position, ...after }
          else terrain = terrain.filter((_, candidate) => candidate !== index)
          break
        case 'replace-kind':
        case 'cover':
          if (tile.covered !== undefined) return { ok: false, code: 'WRONG_TERRAIN' }
          after = { kind: request.toKind, ...(request.mode === 'cover' ? { covered: tile.kind } : {}) }
          terrain[index] = { ...position, ...after }
          break
        case 'replace-with-field':
          if (tile.covered !== undefined) return { ok: false, code: 'WRONG_TERRAIN' }
          if (fields.length > 0 && !hasAdjacentField(fields, position)) return { ok: false, code: 'NOT_ADJACENT' }
          terrain = terrain.filter((_, candidate) => candidate !== index)
          fields.push({ ...position, stacks: [] })
          fieldCreated = true
          after = null
          break
        default: { const exhaustive: never = request; return exhaustive }
      }
    }
    if (JSON.stringify(before) !== JSON.stringify(after) || fieldCreated) changes.push({ ...position, before, after, fieldCreated })
  }
  return { ok: true, operation: { kind: 'terrain', mode: request.mode, positions: changes.map(({ row, col }) => ({ row, col })),
    sourceCardId: request.sourceCardId, changes, preparedPlayer: { ...player, farmTerrain: terrain, fields } } }
}

export function terrainOperationEvent(result: Extract<FarmOperationResult, { kind: 'terrain' }>): DraftGameEvent<'farm.terrainChanged'> {
  return { type: 'farm.terrainChanged', playerId: result.playerId, operation: result.terrainMode,
    changes: result.terrainChanges, newlyUsedTiles: result.newlyUsedTiles,
    ...(result.sourceCardId ? { sourceCardId: result.sourceCardId } : {}) }
}

export const coverVisibleTerrain = (player: PlayerState, tile: FarmTilePosition, fromKind: FarmTerrainKind, toKind: FarmTerrainKind): boolean => {
  const plan = planTerrainOperation(player, { mode: 'cover', positions: [tile], fromKind, toKind })
  if (!plan.ok) return false
  commitFarmOperation(player, plan.operation)
  return true
}

export const removeVisibleTerrain = (player: PlayerState, tile: FarmTilePosition | undefined, kind: FarmTerrainKind):
  { ok: true; cleared: boolean; revealed?: FarmTerrainKind } | { ok: false } => {
  if (!tile) return { ok: false }
  const plan = planTerrainOperation(player, { mode: 'remove', positions: [tile], kind })
  if (!plan.ok) return { ok: false }
  commitFarmOperation(player, plan.operation)
  const after = plan.operation.changes[0]?.after
  return { ok: true, cleared: !after, ...(after ? { revealed: after.kind } : {}) }
}

export type ReplaceTerrainWithFieldResult =
  | { ok: true }
  | { ok: false; code: 'NO_TERRAIN' | 'WRONG_TERRAIN' | 'NOT_ADJACENT' }

export const replaceTerrainWithField = (player: PlayerState, tile: FarmTilePosition, terrainKind: FarmTerrainKind): ReplaceTerrainWithFieldResult => {
  const plan = planTerrainOperation(player, { mode: 'replace-with-field', positions: [tile], fromKind: terrainKind })
  if (!plan.ok) return { ok: false, code: plan.code === 'NO_TERRAIN' || plan.code === 'NOT_ADJACENT' ? plan.code : 'WRONG_TERRAIN' }
  commitFarmOperation(player, plan.operation)
  return { ok: true }
}

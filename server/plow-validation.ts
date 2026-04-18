import type { FarmTilePosition, PlayerFarmState } from './fence-validation.ts'
import {
  FARM_COLS,
  FARM_ROWS,
  computeFencedRegions,
  normalizePlayerFarm,
} from './fence-validation.ts'

export type PlowValidationError = {
  code: 'NO_SELECTION' | 'INVALID_POSITION' | 'OCCUPIED' | 'NOT_ADJACENT' | 'FENCED' | 'LOCKED'
}

export type PlowValidationResult<T extends PlayerFarmState = PlayerFarmState> =
  | { ok: true; player: T }
  | { ok: false; error: PlowValidationError }

const positionKey = (pos: FarmTilePosition) => `${pos.row}-${pos.col}`

const isWithinFarm = (pos: FarmTilePosition) =>
  pos.row >= 0 && pos.row < FARM_ROWS && pos.col >= 0 && pos.col < FARM_COLS

const getFencedTileKeys = (player: PlayerFarmState) => {
  const edgeSet = new Set((player.fenceSegments ?? []).map((s) => s.edge))
  if (edgeSet.size === 0) return new Set<string>()
  const regions = computeFencedRegions(edgeSet).filter((region) => region.fenced)
  const fencedKeys = new Set<string>()
  regions.forEach((region) => {
    region.tiles.forEach((tile) => fencedKeys.add(positionKey(tile)))
  })
  return fencedKeys
}

export const validatePlowSelection = <T extends PlayerFarmState>(
  player: T,
  tile?: FarmTilePosition,
  lockedKeys?: Set<string>,
): PlowValidationResult<T> => {
  if (!tile) {
    return { ok: false, error: { code: 'NO_SELECTION' } }
  }
  if (!isWithinFarm(tile)) {
    return { ok: false, error: { code: 'INVALID_POSITION' } }
  }
  const normalized = normalizePlayerFarm(player)
  const occupied = new Set(normalized.roomTiles.map(positionKey))
  normalized.fields.forEach((field) =>
    occupied.add(positionKey({ row: field.row, col: field.col })),
  )
  normalized.stableTiles.forEach((stable) => occupied.add(positionKey(stable)))
  const targetKey = positionKey(tile)
  if (occupied.has(targetKey)) {
    return { ok: false, error: { code: 'OCCUPIED' } }
  }
  const fencedKeys = getFencedTileKeys(normalized)
  if (fencedKeys.has(targetKey)) {
    return { ok: false, error: { code: 'FENCED' } }
  }
  if (lockedKeys?.has(targetKey)) {
    return { ok: false, error: { code: 'LOCKED' } }
  }
  if (normalized.fields.length > 0) {
    const fieldKeys = new Set(
      normalized.fields.map((field) =>
        positionKey({ row: field.row, col: field.col }),
      ),
    )
    const deltas = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ]
    const adjacent = deltas.some((delta) =>
      fieldKeys.has(`${tile.row + delta.dr}-${tile.col + delta.dc}`),
    )
    if (!adjacent) {
      return { ok: false, error: { code: 'NOT_ADJACENT' } }
    }
  }
  const updated = {
    ...normalized,
    fields: [
      ...normalized.fields,
      { stacks: [], row: tile.row, col: tile.col },
    ],
  }
  return { ok: true, player: updated as T }
}

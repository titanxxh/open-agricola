import type { FarmField, FarmTilePosition, PlayerFarmState } from './fence-validation.ts'
import {
  FARM_COLS,
  FARM_ROWS,
  normalizePlayerFarm,
} from './fence-validation.ts'

export type SowSelection = {
  row: number
  col: number
  crop: 'grain' | 'vegetable'
}

export type SowValidationError = {
  code: 'NO_SELECTION' | 'INVALID_POSITION' | 'NOT_EMPTY' | 'NOT_ENOUGH_SEEDS' | 'INVALID_CROP'
}

export type SowValidationResult =
  | { ok: true; player: PlayerFarmState }
  | { ok: false; error: SowValidationError }

const positionKey = (pos: FarmTilePosition) => `${pos.row}-${pos.col}`

const isWithinFarm = (pos: FarmTilePosition) =>
  pos.row >= 0 && pos.row < FARM_ROWS && pos.col >= 0 && pos.col < FARM_COLS

const buildFieldMap = (fields: FarmField[]) => {
  const map = new Map<string, FarmField>()
  fields.forEach((field) => {
    map.set(positionKey({ row: field.row, col: field.col }), field)
  })
  return map
}

export const validateSowSelection = (
  player: PlayerFarmState,
  selections: SowSelection[],
): SowValidationResult => {
  if (!Array.isArray(selections) || selections.length === 0) {
    return { ok: false, error: { code: 'NO_SELECTION' } }
  }
  const normalized = normalizePlayerFarm(player)
  const fieldMap = buildFieldMap(normalized.fields)
  const used = new Set<string>()
  let grainCount = 0
  let vegetableCount = 0
  for (const selection of selections) {
    const row = Number(selection?.row)
    const col = Number(selection?.col)
    if (!Number.isFinite(row) || !Number.isFinite(col)) {
      return { ok: false, error: { code: 'INVALID_POSITION' } }
    }
    const crop = selection?.crop
    if (crop !== 'grain' && crop !== 'vegetable') {
      return { ok: false, error: { code: 'INVALID_CROP' } }
    }
    const pos = { row, col }
    if (!isWithinFarm(pos)) {
      return { ok: false, error: { code: 'INVALID_POSITION' } }
    }
    const key = positionKey(pos)
    if (used.has(key)) continue
    const field = fieldMap.get(key)
    if (!field || field.crop !== null) {
      return { ok: false, error: { code: 'NOT_EMPTY' } }
    }
    used.add(key)
    if (crop === 'grain') grainCount += 1
    if (crop === 'vegetable') vegetableCount += 1
  }
  if (grainCount > (normalized.resources?.grain ?? 0)) {
    return { ok: false, error: { code: 'NOT_ENOUGH_SEEDS' } }
  }
  if (vegetableCount > (normalized.resources?.vegetable ?? 0)) {
    return { ok: false, error: { code: 'NOT_ENOUGH_SEEDS' } }
  }
  const updatedFields: FarmField[] = normalized.fields.map((field) => {
    const selection = selections.find(
      (item) => item.row === field.row && item.col === field.col,
    )
    if (!selection) return field
    if (selection.crop === 'grain') {
      return { ...field, crop: 'grain', remaining: 3 }
    }
    return { ...field, crop: 'vegetable', remaining: 2 }
  })
  const updated: PlayerFarmState = {
    ...normalized,
    fields: updatedFields,
    resources: {
      ...normalized.resources,
      grain: (normalized.resources?.grain ?? 0) - grainCount,
      vegetable: (normalized.resources?.vegetable ?? 0) - vegetableCount,
    },
  }
  return { ok: true, player: updated }
}

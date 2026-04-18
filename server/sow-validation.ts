import type { FarmField, FarmTilePosition, PlayerFarmState } from './fence-validation.ts'
import {
  FARM_COLS,
  FARM_ROWS,
  normalizePlayerFarm,
} from './fence-validation.ts'

export type SowSelection = {
  row: number
  col: number
  crop: 'grain' | 'vegetable' | 'wood'
}

export type SowValidationError = {
  code: 'NO_SELECTION' | 'INVALID_POSITION' | 'NOT_EMPTY' | 'NOT_ENOUGH_SEEDS' | 'INVALID_CROP'
}

export type SowValidationResult<T extends PlayerFarmState = PlayerFarmState> =
  | { ok: true; player: T }
  | { ok: false; error: SowValidationError }

type SowValidationOptions = {
  maxSelections?: number
  excludedFields?: FarmTilePosition[]
  /** Extra sowable fields keyed by position, with their allowed crops. */
  extraAllowedCrops?: Map<string, SowSelection['crop'][]>
}

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

export const validateSowSelection = <T extends PlayerFarmState>(
  player: T,
  selections: SowSelection[],
  options: SowValidationOptions = {},
): SowValidationResult<T> => {
  if (!Array.isArray(selections) || selections.length === 0) {
    return { ok: false, error: { code: 'NO_SELECTION' } }
  }
  const normalized = normalizePlayerFarm(player)
  const fieldMap = buildFieldMap(normalized.fields)
  const used = new Set<string>()
  const excluded = new Set(
    (options.excludedFields ?? []).map((field) => positionKey(field)),
  )
  let grainCount = 0
  let vegetableCount = 0
  for (const selection of selections) {
    const row = Number(selection?.row)
    const col = Number(selection?.col)
    if (!Number.isFinite(row) || !Number.isFinite(col)) {
      return { ok: false, error: { code: 'INVALID_POSITION' } }
    }
    const crop = selection?.crop
    if (crop !== 'grain' && crop !== 'vegetable' && crop !== 'wood') {
      return { ok: false, error: { code: 'INVALID_CROP' } }
    }
    const pos = { row, col }
    const key = positionKey(pos)
    const extraAllowedCrops = options.extraAllowedCrops?.get(key)
    const isExtraField = !!extraAllowedCrops
    if (!isExtraField && crop === 'wood') {
      return { ok: false, error: { code: 'INVALID_CROP' } }
    }
    if (extraAllowedCrops && !extraAllowedCrops.includes(crop)) {
      return { ok: false, error: { code: 'INVALID_CROP' } }
    }
    if (!isExtraField && !isWithinFarm(pos)) {
      return { ok: false, error: { code: 'INVALID_POSITION' } }
    }
    if (used.has(key)) continue
    if (excluded.has(key)) {
      return { ok: false, error: { code: 'INVALID_POSITION' } }
    }
    const field = fieldMap.get(key)
    if (!isExtraField && (!field || field.stacks.length !== 0)) {
      return { ok: false, error: { code: 'NOT_EMPTY' } }
    }
    used.add(key)
    // Don't count extra fields toward resource usage — the card handles deduction
    if (isExtraField) continue
    if (crop === 'grain') grainCount += 1
    if (crop === 'vegetable') vegetableCount += 1
  }
  if (
    typeof options.maxSelections === 'number' &&
    used.size > Math.max(0, Math.floor(options.maxSelections))
  ) {
    return { ok: false, error: { code: 'INVALID_POSITION' } }
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
    // Skip extra fields — they are handled by the card
    const key = positionKey({ row: field.row, col: field.col })
    if (options.extraAllowedCrops?.has(key)) return field
    if (selection.crop === 'grain') {
      return { ...field, stacks: [...field.stacks, { kind: 'grain', remaining: 3 }] }
    }
    if (selection.crop === 'vegetable') {
      return { ...field, stacks: [...field.stacks, { kind: 'vegetable', remaining: 2 }] }
    }
    return field
  })
  const updated = {
    ...normalized,
    fields: updatedFields,
    resources: {
      ...normalized.resources,
      grain: (normalized.resources?.grain ?? 0) - grainCount,
      vegetable: (normalized.resources?.vegetable ?? 0) - vegetableCount,
    },
  }
  return { ok: true, player: updated as T }
}

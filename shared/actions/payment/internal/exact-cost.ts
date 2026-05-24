import type { ExactCost, Resource } from '../../../contract/types'
import { REAL_RESOURCE_KEYS } from '../../../contract/resource-keys'
import { applyCostOverride } from './affordability'

export type NormalizedExactUnitCost = {
  unitCost: Partial<Resource>
  max?: number
}

export const readExactCost = (
  source?: Record<string, unknown>,
): ExactCost | undefined => {
  const exactCost = source?.exactCost
  if (!exactCost || typeof exactCost !== 'object') return undefined
  return exactCost as ExactCost
}

export const normalizeExactUnitCost = (
  exactCost: ExactCost,
): NormalizedExactUnitCost => {
  const unitCost: Partial<Resource> = {}
  for (const key of REAL_RESOURCE_KEYS) {
    const value = exactCost[key]
    if (value === undefined || value === 0) continue
    if (value < 0) throw new Error(`negative exactCost.${key} is not supported`)
    unitCost[key] = value
  }
  const max = typeof exactCost.max === 'number'
    ? Math.max(0, Math.floor(exactCost.max))
    : undefined
  return max === undefined ? { unitCost } : { unitCost, max }
}

const scaleCost = (
  cost: Partial<Resource>,
  count: number,
): Partial<Resource> => {
  const total: Partial<Resource> = {}
  for (const [key, value] of Object.entries(cost)) {
    if (typeof value !== 'number' || value <= 0) continue
    total[key as keyof Resource] = value * count
  }
  return total
}

export const resolveExactUnitCost = (
  exactCost: ExactCost,
  count: number,
): Partial<Resource> | null => {
  const normalized = normalizeExactUnitCost(exactCost)
  if (count <= 0) return {}
  if (normalized.max !== undefined && count > normalized.max) return null
  return scaleCost(normalized.unitCost, count)
}

export const resolveUnitCostWithDelta = (
  defaultUnitCost: Partial<Resource>,
  exactCost: ExactCost | undefined,
  delta: Partial<Resource> | undefined,
  count: number,
): Partial<Resource> | null => {
  if (count <= 0) return {}
  const normalized = exactCost
    ? normalizeExactUnitCost(exactCost)
    : { unitCost: defaultUnitCost }
  if (normalized.max !== undefined && count > normalized.max) return null
  const effectiveUnitCost = applyCostOverride(normalized.unitCost, delta)
  return scaleCost(effectiveUnitCost, count)
}

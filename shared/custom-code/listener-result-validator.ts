import type { ActionHookResult } from '../actions/hooks'
import { REAL_RESOURCE_KEYS } from '../contract/resource-keys'

const RESOURCE_KEYS = new Set<string>(REAL_RESOURCE_KEYS)

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
)

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (!isRecord(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const isResourceDelta = (value: unknown): value is Record<string, number> => (
  isPlainRecord(value)
  && Object.entries(value).every(([key, amount]) => (
    RESOURCE_KEYS.has(key) && typeof amount === 'number' && Number.isFinite(amount)
  ))
)

const equalResourceDeltas = (
  left: Record<string, number>,
  right: Record<string, number>,
): boolean => {
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length
    && keys.every(key => left[key] === right[key])
}

export const validateCustomListenerResult = (
  value: unknown,
  cardId: string,
): ActionHookResult | null => {
  if (value === null || value === undefined) return null
  if (!isPlainRecord(value)) throw new Error('custom listener result must be a plain object')
  if (!Object.hasOwn(value, 'costs')) {
    if ('costs' in value) throw new Error('custom listener costs must be an own property')
    return value as ActionHookResult
  }

  const attribution = Object.hasOwn(value, 'costAttribution') ? value.costAttribution : undefined
  const entry = Array.isArray(attribution) && attribution.length === 1
    && isPlainRecord(attribution[0])
    ? attribution[0]
    : null
  if (
    !isResourceDelta(value.costs)
    || !entry
    || !Object.hasOwn(entry, 'sourceCard')
    || entry.sourceCard !== cardId
    || !Object.hasOwn(entry, 'costs')
    || !isResourceDelta(entry.costs)
    || !equalResourceDeltas(value.costs, entry.costs)
  ) {
    throw new Error('custom listener results with costs require one matching costAttribution entry')
  }
  return value as ActionHookResult
}

import { assertCustomListenerCapabilities } from './runtime-capabilities'
import type { CardListenerContext } from '../cards/card-listeners'
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

const normalizeResourceDelta = (value: unknown): Record<string, number> | null => {
  if (!isPlainRecord(value)) return null
  const result: Record<string, number> = {}
  for (const [key, amount] of Object.entries(value)) {
    if (amount === undefined) continue
    if (!RESOURCE_KEYS.has(key) || typeof amount !== 'number' || !Number.isFinite(amount)) return null
    result[key] = amount
  }
  return result
}

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
  context?: CardListenerContext,
): ActionHookResult | null => {
  if (value === null || value === undefined) return null
  if (!isPlainRecord(value)) throw new Error('custom listener result must be a plain object')
  assertCustomListenerCapabilities(value, cardId, context)
  if (!Object.hasOwn(value, 'costs')) {
    if ('costs' in value) throw new Error('custom listener costs must be an own property')
    if ('costAttribution' in value) {
      throw new Error('custom listener results with costAttribution require costs')
    }
    return value as ActionHookResult
  }

  const attribution = Object.hasOwn(value, 'costAttribution') ? value.costAttribution : undefined
  const entry = Array.isArray(attribution) && attribution.length === 1
    && isPlainRecord(attribution[0])
    ? attribution[0]
    : null
  const costs = normalizeResourceDelta(value.costs)
  const attributedCosts = entry ? normalizeResourceDelta(entry.costs) : null
  if (
    !costs
    || !entry
    || !Object.hasOwn(entry, 'sourceCard')
    || entry.sourceCard !== cardId
    || !Object.hasOwn(entry, 'costs')
    || !attributedCosts
    || !equalResourceDeltas(costs, attributedCosts)
  ) {
    throw new Error('custom listener results with costs require one matching costAttribution entry')
  }
  return value as ActionHookResult
}

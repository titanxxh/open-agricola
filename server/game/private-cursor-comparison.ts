import { isCapturedHistoryStream } from '../../shared/session/history-streams.ts'

export type PrivateCursorComparison =
  | null
  | boolean
  | number
  | string
  | readonly PrivateCursorComparison[]
  | { readonly [key: string]: PrivateCursorComparison }

const omitted = (value: unknown): boolean =>
  value === undefined || typeof value === 'function' || typeof value === 'symbol'

/** Own mutable cursor values; only registered, immutable history streams stay shared. */
export const capturePrivateCursor = (cursor: unknown): PrivateCursorComparison => {
  const copied = new WeakMap<object, PrivateCursorComparison>()
  const capture = (value: unknown, inArray: boolean): PrivateCursorComparison | undefined => {
    if (value === null) return null
    if (typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (typeof value === 'bigint') throw new TypeError('BigInt is not JSON serializable')
    if (typeof value !== 'object') return inArray ? null : undefined
    if (isCapturedHistoryStream(value)) return value as readonly PrivateCursorComparison[]
    const cached = copied.get(value)
    if (cached) return cached
    if (Array.isArray(value)) {
      const result: PrivateCursorComparison[] = new Array(value.length)
      copied.set(value, result)
      // Preserve holes: the existing canonical encoder distinguishes them from null.
      for (let index = 0; index < value.length; index += 1) {
        if (index in value) result[index] = capture(value[index], true) ?? null
      }
      return result
    }
    const result: Record<string, PrivateCursorComparison> = {}
    copied.set(value, result)
    for (const key of Object.keys(value)) {
      const child = capture((value as Record<string, unknown>)[key], false)
      if (child === undefined) continue
      if (key === '__proto__') {
        Object.defineProperty(result, key, { value: child, enumerable: true })
      } else {
        result[key] = child
      }
    }
    return result
  }
  const result = capture(cursor, false)
  if (result === undefined) throw new TypeError('value is not JSON serializable')
  return result
}

/** Compare the same values as canonical JSON, without sorting keys or encoding strings. */
export const privateCursorEquals = (before: PrivateCursorComparison, current: unknown): boolean => {
  const equal = (left: PrivateCursorComparison, right: unknown, inArray: boolean): boolean => {
    if (typeof right === 'bigint') throw new TypeError('BigInt is not JSON serializable')
    if ((typeof right === 'number' && !Number.isFinite(right)) || (inArray && omitted(right))) {
      right = null
    }
    if (left === right) return true
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right)) return false
      // A single hole encodes as [] in the existing canonical implementation.
      const leftLength = left.length === 1 && !(0 in left) ? 0 : left.length
      const rightLength = right.length === 1 && !(0 in right) ? 0 : right.length
      if (leftLength !== rightLength) return false
      for (let index = 0; index < leftLength; index += 1) {
        const leftPresent = index in left
        if (leftPresent !== (index in right)) return false
        if (leftPresent && !equal(left[index]!, right[index], true)) return false
      }
      return true
    }
    const leftRecord = left as { readonly [key: string]: PrivateCursorComparison }
    const rightRecord = right as Record<string, unknown>
    let fields = 0
    for (const key of Object.keys(rightRecord)) {
      const value = rightRecord[key]
      if (omitted(value)) continue
      fields += 1
      if (!Object.hasOwn(leftRecord, key) || !equal(leftRecord[key]!, value, false)) return false
    }
    return fields === Object.keys(leftRecord).length
  }
  return equal(before, current, false)
}

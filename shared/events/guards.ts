export const assertPublicGameEvent = (event: unknown): void => {
  const visibility = (event as { visibility?: unknown } | null)?.visibility
  if (visibility !== 'public') {
    throw new Error('GameEvent must be public')
  }
}

const assertJsonSafeValue = (value: unknown, path: string): void => {
  if (value === undefined) {
    throw new Error(`GameEvent must be JSON-safe at ${path}`)
  }
  if (value === null) return

  const valueType = typeof value
  if (valueType === 'string' || valueType === 'boolean') return
  if (valueType === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`GameEvent must be JSON-safe at ${path}`)
    }
    return
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonSafeValue(entry, `${path}[${index}]`))
    return
  }

  if (valueType === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new Error(`GameEvent must be JSON-safe at ${path}`)
    }
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      assertJsonSafeValue(entry, `${path}.${key}`)
    })
    return
  }

  throw new Error(`GameEvent must be JSON-safe at ${path}`)
}

export const assertJsonSafeEvent = (event: unknown): void => {
  assertJsonSafeValue(event, '$')
}

export const assertEventSizeUnderLimit = (event: unknown, limit: number): void => {
  const serialized = JSON.stringify(event)
  const size = serialized === undefined ? 0 : serialized.length
  if (size > limit) {
    throw new Error(`GameEvent exceeds ${limit} bytes`)
  }
}

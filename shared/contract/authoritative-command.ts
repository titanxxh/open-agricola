const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined && typeof entry !== 'function')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalValue(entry)]),
  )
}

const unorderedSelectionFields = new Set([
  'cardIds',
  'crops',
  'edges',
  'palisadeEdges',
  'positions',
  'rooms',
  'stables',
])

const normalizeCommandPayload = (type: string, payload: unknown): unknown => {
  if (type !== 'commitSelection' || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload
  }
  return Object.fromEntries(Object.entries(payload as Record<string, unknown>).map(([key, value]) => [
    key,
    Array.isArray(value) && unorderedSelectionFields.has(key)
      ? [...value].sort((left, right) =>
          JSON.stringify(canonicalValue(left)).localeCompare(JSON.stringify(canonicalValue(right))))
      : value,
  ]))
}

export const canonicalJson = (value: unknown): string => JSON.stringify(canonicalValue(value))

export const authoritativeCommandKey = (
  type: string,
  playerIndex: number | null,
  payload?: unknown,
): string => canonicalJson({ type, playerIndex, payload: normalizeCommandPayload(type, payload) })

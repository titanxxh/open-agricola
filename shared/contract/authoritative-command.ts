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
const unorderedChoicePayloadFields = new Set(['zones'])

const sortCanonical = (value: unknown[]): unknown[] => [...value].sort((left, right) =>
  JSON.stringify(canonicalValue(left)).localeCompare(JSON.stringify(canonicalValue(right))))

const normalizeFields = (
  payload: Record<string, unknown>,
  fields: ReadonlySet<string>,
): Record<string, unknown> => Object.fromEntries(Object.entries(payload).map(([key, value]) => [
  key,
  Array.isArray(value) && fields.has(key) ? sortCanonical(value) : value,
]))

const normalizeCommandPayload = (type: string, payload: unknown): unknown => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload
  }
  const record = payload as Record<string, unknown>
  if (type === 'commitSelection') return normalizeFields(record, unorderedSelectionFields)
  if (type !== 'choice' || !record.payload || typeof record.payload !== 'object' ||
      Array.isArray(record.payload)) return payload
  return {
    ...record,
    payload: normalizeFields(record.payload as Record<string, unknown>, unorderedChoicePayloadFields),
  }
}

export const canonicalJson = (value: unknown): string => JSON.stringify(canonicalValue(value))

export const authoritativeCommandKey = (
  type: string,
  playerIndex: number | null,
  payload?: unknown,
): string => canonicalJson({ type, playerIndex, payload: normalizeCommandPayload(type, payload) })

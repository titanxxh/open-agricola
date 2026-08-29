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

export const canonicalJson = (value: unknown): string => JSON.stringify(canonicalValue(value))

export const authoritativeCommandKey = (
  type: string,
  playerIndex: number | null,
  payload?: unknown,
): string => canonicalJson({ type, playerIndex, payload })

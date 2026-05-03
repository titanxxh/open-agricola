export function flattenDictionary(dict: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  if (dict === null || typeof dict !== 'object') return out
  for (const [key, value] of Object.entries(dict as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      out.set(path, value)
    } else if (value !== null && typeof value === 'object') {
      for (const [k, v] of flattenDictionary(value, path)) out.set(k, v)
    }
  }
  return out
}

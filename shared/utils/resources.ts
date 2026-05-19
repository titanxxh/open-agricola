import type { Resource } from '../contract/types'

export const mergeResources = (
  a: Partial<Resource>,
  b: Partial<Resource>,
): Partial<Resource> => {
  const out: Partial<Resource> = { ...a }
  for (const [k, v] of Object.entries(b)) {
    out[k as keyof Resource] = ((out[k as keyof Resource] ?? 0) + (v ?? 0))
  }
  return out
}

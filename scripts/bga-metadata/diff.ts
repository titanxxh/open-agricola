import type { BgaCard } from './parse-bga'
import type { TsCard } from './parse-ts'

export type Verdict = 'warn' | 'error' | 'ok'

export type FieldDiff = {
  id: string
  field: string
  bga: unknown
  ours: unknown
  verdict: Verdict
}

export type DiffResult = {
  deviations: FieldDiff[]
  bgaOnly: string[]
  tsOnly: string[]
  bannedButPresent: string[]
  totalBga: number
  totalTs: number
}

const LITERAL_FIELDS = ['extraVp', 'vp'] as const
const COMPLEX_FIELDS = ['category', 'players', 'cost', 'altCosts', 'prerequisite'] as const

function objectShallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  const ka = Object.keys(a as Record<string, unknown>).sort()
  const kb = Object.keys(b as Record<string, unknown>).sort()
  if (ka.length !== kb.length) return false
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return false
    if ((a as Record<string, unknown>)[ka[i]] !== (b as Record<string, unknown>)[kb[i]]) return false
  }
  return true
}

function arrayOfObjectsEqual(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return a === b
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!objectShallowEqual(a[i], b[i])) return false
  }
  return true
}

function isEmptyObj(v: unknown): boolean {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v as Record<string, unknown>).length === 0
}

function isEmptyArr(v: unknown): boolean {
  return Array.isArray(v) && v.length === 0
}

export function diffCards(bgaMap: Map<string, BgaCard>, tsMap: Map<string, TsCard>): DiffResult {
  const deviations: FieldDiff[] = []
  const bgaOnly: string[] = []
  const tsOnly: string[] = []
  const bannedButPresent: string[] = []

  const allKeys = new Set<string>([...bgaMap.keys(), ...tsMap.keys()])
  for (const key of allKeys) {
    const bga = bgaMap.get(key)
    const ts = tsMap.get(key)
    // Prefer the card's own id (e.g. 'A100_Curator') for human-readable reporting.
    const id = bga?.id ?? ts?.id ?? key

    if (bga && !ts) { bgaOnly.push(id); continue }
    if (!bga && ts) { tsOnly.push(id); continue }
    if (!bga || !ts) continue

    // BGA-banned: OA still keeps the card active (memory feedback_no_banned_schema).
    // Track in bannedButPresent list AND still compare fields — OA keeps banned cards
    // in active pool, so metadata still needs to align with BGA.
    if (bga.banned) bannedButPresent.push(id)

    for (const field of LITERAL_FIELDS) {
      let bv = bga[field]
      let ov = ts[field]
      // vp: 0 is semantically equivalent to missing vp.
      if (field === 'vp') {
        if (bv === 0) bv = undefined
        if (ov === 0) ov = undefined
      }
      if (bv === undefined && ov === undefined) continue
      if (bv !== ov) deviations.push({ id, field, bga: bv, ours: ov, verdict: 'warn' })
    }
    for (const field of COMPLEX_FIELDS) {
      let bv = bga[field as keyof BgaCard]
      let ov = ts[field as keyof TsCard]
      if (field === 'cost') {
        if (isEmptyObj(bv)) bv = undefined
        if (isEmptyObj(ov)) ov = undefined
      }
      if (field === 'altCosts') {
        if (isEmptyArr(bv)) bv = undefined
        if (isEmptyArr(ov)) ov = undefined
        if (bv === undefined && ov === undefined) continue
        if (!arrayOfObjectsEqual(bv, ov)) {
          deviations.push({ id, field, bga: bv, ours: ov, verdict: 'error' })
        }
        continue
      }
      if (field === 'players') {
        if (bv === undefined) bv = '1+'
        if (ov === undefined) ov = '1+'
      }
      if (bv === undefined && ov === undefined) continue
      const equal = typeof bv === 'object' && typeof ov === 'object'
        ? objectShallowEqual(bv, ov)
        : bv === ov
      if (!equal) deviations.push({ id, field, bga: bv, ours: ov, verdict: 'error' })
    }
  }

  bgaOnly.sort()
  tsOnly.sort()
  bannedButPresent.sort()

  return {
    deviations,
    bgaOnly,
    tsOnly,
    bannedButPresent,
    totalBga: bgaMap.size,
    totalTs: tsMap.size,
  }
}

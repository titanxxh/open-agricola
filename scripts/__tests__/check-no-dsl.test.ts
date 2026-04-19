import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { findDslHits } from '../check-no-dsl'

const fixturesRoot = path.resolve(__dirname, 'fixtures/dsl-samples')

describe('check-no-dsl', () => {
  it('finds DSL keywords in dirty file', () => {
    const hits = findDslHits([path.join(fixturesRoot, 'dirty.ts')])
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.some((h) => h.keyword === 'CardDslEffects')).toBe(true)
    expect(hits.some((h) => h.keyword === 'dslToCardEffect')).toBe(true)
  })

  it('returns empty for clean file', () => {
    const hits = findDslHits([path.join(fixturesRoot, 'clean.ts')])
    expect(hits).toEqual([])
  })
})

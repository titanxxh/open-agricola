import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { findDslHits, scanDslFiles } from '../check-no-dsl'

const fixturesRoot = path.resolve(__dirname, 'fixtures/dsl-samples')

describe('check-no-dsl', () => {
  it('requires every root and includes client, replay and module scripts', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'dsl-scope-'))
    try {
      expect(() => scanDslFiles(root)).toThrow()
      for (const directory of ['shared', 'server', 'client', 'replay-viewer', 'scripts', 'tests', 'e2e-tests']) mkdirSync(path.join(root, directory))
      for (const file of ['client/probe.tsx', 'replay-viewer/probe.mjs']) writeFileSync(path.join(root, file), 'effectDsl')
      expect(findDslHits(scanDslFiles(root))).toHaveLength(2)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

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

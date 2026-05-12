import { describe, expect, it } from 'vitest'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseBgaCard } from '../bga-metadata/parse-bga'
import { parseTsCard } from '../bga-metadata/parse-ts'
import { diffCards, type FieldDiff } from '../bga-metadata/diff'
import { renderReport } from '../bga-metadata/report'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = path.resolve(__dirname, 'fixtures')

describe('parseBgaCard', () => {
  it('extracts all literal fields from a full BGA card', () => {
    const phpPath = path.join(FIXTURE_DIR, 'bga/A99_Test.php')
    const card = parseBgaCard(phpPath)
    expect(card).toEqual({
      id: 'A99_Test',
      deck: 'A',
      number: 99,
      name: 'Test Card',
      category: 'POINTS_PROVIDER',
      players: '1+',
      extraVp: true,
      vp: 2,
      cost: { wood: 1, food: 2 },
      prerequisite: '5 Sheep on farm',
      banned: false,
    })
  })

  it('marks banned cards', () => {
    const phpPath = path.join(FIXTURE_DIR, 'bga/A14_Banned.php')
    const card = parseBgaCard(phpPath)
    expect(card.banned).toBe(true)
    expect(card.id).toBe('A14_Banned')
  })
})

describe('parseTsCard', () => {
  it('extracts fields from TS card-display file', () => {
    const tsPath = path.join(FIXTURE_DIR, 'ts/A99_Test.ts')
    const card = parseTsCard(tsPath)
    expect(card).toEqual({
      id: 'A99_Test',
      deck: 'A',
      number: 99,
      name: 'Test Card',
      category: 'POINTS_PROVIDER',
      players: '1+',
      vp: 1,
      cost: { wood: 1, food: 2 },
      prerequisite: 'Wooden House',
    })
  })

  it('handles cards with no optional fields', () => {
    const tsPath = path.join(FIXTURE_DIR, 'ts/A77_TsOnly.ts')
    const card = parseTsCard(tsPath)
    expect(card.id).toBe('A77_TsOnly')
    expect(card.players).toBe('1+')
    expect(card.extraVp).toBeUndefined()
    expect(card.vp).toBeUndefined()
  })
})

describe('diffCards', () => {
  it('produces ⚠ for extraVp/vp deviations, ❌ for prerequisite text, tracks BGA-only and TS-only', () => {
    const bgaMap = new Map([
      ['A99_Test', { id: 'A99_Test', deck: 'A', number: 99, category: 'POINTS_PROVIDER', players: '1+', extraVp: true, vp: 2, cost: { wood: 1, food: 2 }, prerequisite: '5 Sheep on farm', banned: false }],
      ['A14_Banned', { id: 'A14_Banned', deck: 'A', number: 14, category: 'ACTIONS_BOOSTER', players: '1+', banned: true }],
    ])
    const tsMap = new Map([
      ['A99_Test', { id: 'A99_Test', deck: 'A', number: 99, category: 'POINTS_PROVIDER', players: '1+', vp: 1, cost: { wood: 1, food: 2 }, prerequisite: 'Wooden House' }],
      ['A77_TsOnly', { id: 'A77_TsOnly', deck: 'A', number: 77, players: '1+' }],
    ])
    const result = diffCards(bgaMap as never, tsMap as never)

    const a99 = result.deviations.filter((d: FieldDiff) => d.id === 'A99_Test')
    expect(a99.find(d => d.field === 'vp')?.verdict).toBe('warn')
    expect(a99.find(d => d.field === 'extraVp')?.verdict).toBe('warn')
    expect(a99.find(d => d.field === 'prerequisite')?.verdict).toBe('error')

    expect(result.bannedButPresent).toEqual([])
    expect(result.bgaOnly).toEqual(['A14_Banned'])
    expect(result.tsOnly).toEqual(['A77_TsOnly'])
  })
})

describe('renderReport', () => {
  it('produces a markdown report with summary section', () => {
    const md = renderReport({
      deviations: [
        { id: 'A99_Test', field: 'vp', bga: 2, ours: 1, verdict: 'warn' },
        { id: 'A99_Test', field: 'extraVp', bga: true, ours: undefined, verdict: 'warn' },
      ],
      bgaOnly: ['A14_Banned'],
      tsOnly: ['A77_TsOnly'],
      bannedButPresent: [],
      totalBga: 2,
      totalTs: 2,
    }, '2026-05-12')
    expect(md).toContain('# BGA Metadata Diff Report (2026-05-12)')
    expect(md).toContain('## Summary')
    expect(md).toContain('## ⚠ Literal deviations (auto-fixable)')
    expect(md).toContain('A99_Test')
    expect(md).toContain('A14_Banned')
  })
})

import { describe, expect, it } from 'vitest'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseBgaCard } from '../bga-metadata/parse-bga'
import { parseTsCard } from '../bga-metadata/parse-ts'
import { diffCards, type FieldDiff } from '../bga-metadata/diff'
import { renderReport } from '../bga-metadata/report'
import { applySafeFix } from '../bga-metadata/apply-safe'

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

  it('parses quoted-string category with hyphens', () => {
    const phpPath = path.join(FIXTURE_DIR, 'bga/E100_Quoted.php')
    const card = parseBgaCard(phpPath)
    expect(card.category).toBe('BONUS_POINTS_-_GET')
  })

  it('parses quoted-number cost (single and double quotes)', () => {
    const phpPath = path.join(FIXTURE_DIR, 'bga/A77_QuotedCost.php')
    const card = parseBgaCard(phpPath)
    expect(card.cost).toEqual({ wood: 2, reed: 1 })
  })

  it('unwraps paren-wrapped prerequisite shorthand', () => {
    const phpPath = path.join(FIXTURE_DIR, 'bga/A18_ParenPrereq.php')
    const card = parseBgaCard(phpPath)
    expect(card.prerequisite).toBe('2 Occupations')
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

describe('diffCards vp normalization', () => {
  it('treats vp:0 on either side as missing — no deviation', () => {
    const bgaMap = new Map([
      ['X1_A', { id: 'X1_A', deck: 'X', number: 1, vp: 0, banned: false }],
      ['X2_B', { id: 'X2_B', deck: 'X', number: 2, banned: false }],
    ])
    const tsMap = new Map([
      ['X1_A', { id: 'X1_A', deck: 'X', number: 1 }],
      ['X2_B', { id: 'X2_B', deck: 'X', number: 2, vp: 0 }],
    ])
    const result = diffCards(bgaMap as never, tsMap as never)
    expect(result.deviations.filter(d => d.field === 'vp')).toEqual([])
  })
})

describe('diffCards cost normalization', () => {
  it('treats cost:{} on either side as missing — no deviation', () => {
    const bgaMap = new Map([
      ['X1_Y', { id: 'X1_Y', deck: 'X', number: 1, banned: false }],
      ['X2_Z', { id: 'X2_Z', deck: 'X', number: 2, cost: {}, banned: false }],
    ])
    const tsMap = new Map([
      ['X1_Y', { id: 'X1_Y', deck: 'X', number: 1, cost: {} }],
      ['X2_Z', { id: 'X2_Z', deck: 'X', number: 2 }],
    ])
    const result = diffCards(bgaMap as never, tsMap as never)
    expect(result.deviations.filter(d => d.field === 'cost')).toEqual([])
  })

  it('still reports real cost differences (non-empty vs empty / different values)', () => {
    const bgaMap = new Map([
      ['X3_W', { id: 'X3_W', deck: 'X', number: 3, cost: { wood: 1 }, banned: false }],
      ['X4_V', { id: 'X4_V', deck: 'X', number: 4, cost: { wood: 2 }, banned: false }],
    ])
    const tsMap = new Map([
      ['X3_W', { id: 'X3_W', deck: 'X', number: 3 }],
      ['X4_V', { id: 'X4_V', deck: 'X', number: 4, cost: { wood: 1 } }],
    ])
    const result = diffCards(bgaMap as never, tsMap as never)
    const costDevs = result.deviations.filter(d => d.field === 'cost')
    expect(costDevs).toHaveLength(2)
    expect(costDevs.find(d => d.id === 'X3_W')?.ours).toBeUndefined()
    expect(costDevs.find(d => d.id === 'X4_V')?.bga).toEqual({ wood: 2 })
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

describe('applySafeFix', () => {
  it('replaces vp literal, inserts extraVp:true, inserts category', () => {
    const tsPath = path.join(FIXTURE_DIR, 'ts/A88_FixMe.ts')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs')
    const before = fs.readFileSync(tsPath, 'utf8') as string
    const patched = applySafeFix(before, [
      { field: 'vp', target: 2 },
      { field: 'extraVp', target: true },
      { field: 'category', target: 'POINTS_PROVIDER' },
    ])
    expect(patched).toContain('vp: 2,')
    expect(patched).toContain('extraVp: true,')
    expect(patched).toContain("category: 'POINTS_PROVIDER',")
    expect(patched).not.toContain('vp: 0')
  })

  it('replaces existing category value', () => {
    const src = `import { Occupation } from '../../../../shared/cards-display/types'\n\nexport const X = new Occupation({\n  id: 'X1_A',\n  name: 'X',\n  deck: 'X',\n  number: 1,\n  category: 'OLD',\n  desc: ['x'],\n  cost: {},\n  players: '1+',\n})\n`
    const patched = applySafeFix(src, [{ field: 'category', target: 'NEW' }])
    expect(patched).toContain("category: 'NEW',")
    expect(patched).not.toContain("category: 'OLD'")
  })
})

import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseBgaCard } from '../bga-metadata/parse-bga'
import { parseTsCard } from '../bga-metadata/parse-ts'
import { diffCards, type FieldDiff } from '../bga-metadata/diff'
import { renderReport } from '../bga-metadata/report'
import { applySafeFix } from '../bga-metadata/apply-safe'
import { resolveBgaRoot } from '../bga-metadata/resolve-bga-root'

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

  it('parses altCosts from $this->costs = [[...],[...]] form', () => {
    const phpPath = path.join(FIXTURE_DIR, 'bga/B7w_AltCostsOnly.php')
    const card = parseBgaCard(phpPath)
    expect(card.altCosts).toEqual([{ wood: 1 }, { food: 2 }])
    expect(card.cost).toBeUndefined()
  })

  it('parses STABLE cost as a cost pseudo-resource', () => {
    const phpPath = path.join(FIXTURE_DIR, 'bga/C54_StableCost.php')
    const card = parseBgaCard(phpPath)
    expect(card.cost).toEqual({ stable: 1 })
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

  it('parses JSON double-quoted cost key', () => {
    const tsPath = path.join(FIXTURE_DIR, 'ts/A29_JsonCost.ts')
    const card = parseTsCard(tsPath)
    expect(card.cost).toEqual({ wood: 1 })
  })

  it('parses altCosts from TS array-of-objects literal', () => {
    const tsPath = path.join(FIXTURE_DIR, 'ts/A29w_TsAltCosts.ts')
    const card = parseTsCard(tsPath)
    expect(card.altCosts).toEqual([{ wood: 1 }, { food: 2 }])
    expect(card.cost).toBeUndefined()
  })

  it('parses passing metadata from TS card-display file', () => {
    const tsPath = path.join(FIXTURE_DIR, 'ts/C1_Passing.ts')
    const card = parseTsCard(tsPath)
    expect(card.passing).toBe(true)
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
    expect(a99.find(d => d.field === 'passing')).toBeUndefined()

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

  it('reports STABLE cost differences after parsing it as stable', () => {
    const bgaMap = new Map([
      ['C54_StableCost', { id: 'C54_StableCost', deck: 'C', number: 54, cost: { stable: 1 }, banned: false }],
    ])
    const tsMap = new Map([
      ['C54_StableCost', { id: 'C54_StableCost', deck: 'C', number: 54, cost: {} }],
    ])
    const result = diffCards(bgaMap as never, tsMap as never)
    const costDev = result.deviations.find(d => d.field === 'cost')
    expect(costDev?.bga).toEqual({ stable: 1 })
    expect(costDev?.ours).toBeUndefined()
    expect(costDev?.verdict).toBe('error')
  })
})

describe('diffCards passing metadata', () => {
  it('reports passing=true when TS omits it', () => {
    const bgaMap = new Map([
      ['C1_Overhaul', { id: 'C1_Overhaul', deck: 'C', number: 1, passing: true, banned: false }],
    ])
    const tsMap = new Map([
      ['C1_Overhaul', { id: 'C1_Overhaul', deck: 'C', number: 1 }],
    ])
    const result = diffCards(bgaMap as never, tsMap as never)
    expect(result.deviations).toEqual([
      { id: 'C1_Overhaul', field: 'passing', bga: true, ours: undefined, verdict: 'warn' },
    ])
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

describe('diffCards players normalization', () => {
  it('treats players undefined as "1+" on either side and both missing', () => {
    const bgaMap = new Map([
      ['X1', { id: 'X1', deck: 'X', number: 1, banned: false }],                  // BGA missing
      ['X2', { id: 'X2', deck: 'X', number: 2, players: '1+', banned: false }],   // BGA 1+
      ['X3', { id: 'X3', deck: 'X', number: 3, banned: false }],                  // both missing
    ])
    const tsMap = new Map([
      ['X1', { id: 'X1', deck: 'X', number: 1, players: '1+' }],   // TS 1+
      ['X2', { id: 'X2', deck: 'X', number: 2 }],                  // TS missing
      ['X3', { id: 'X3', deck: 'X', number: 3 }],                  // TS missing
    ])
    const result = diffCards(bgaMap as never, tsMap as never)
    expect(result.deviations.filter(d => d.field === 'players')).toEqual([])
  })

  it('still reports players deviation when one side is non-default', () => {
    const bgaMap = new Map([
      ['Y1', { id: 'Y1', deck: 'Y', number: 1, players: '3+', banned: false }],   // BGA 3+
      ['Y2', { id: 'Y2', deck: 'Y', number: 2, banned: false }],                  // BGA missing
    ])
    const tsMap = new Map([
      ['Y1', { id: 'Y1', deck: 'Y', number: 1 }],                                 // TS missing → 1+
      ['Y2', { id: 'Y2', deck: 'Y', number: 2, players: '3+' }],                  // TS 3+
    ])
    const result = diffCards(bgaMap as never, tsMap as never)
    const playerDevs = result.deviations.filter(d => d.field === 'players')
    expect(playerDevs).toHaveLength(2)
    expect(playerDevs.find(d => d.id === 'Y1')?.bga).toBe('3+')
    expect(playerDevs.find(d => d.id === 'Y2')?.ours).toBe('3+')
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
      { field: 'passing', target: true },
      { field: 'category', target: 'POINTS_PROVIDER' },
    ])
    expect(patched).toContain('vp: 2,')
    expect(patched).toContain('extraVp: true,')
    expect(patched).toContain('passing: true,')
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

describe('diffCards altCosts', () => {
  it('reports deviation when one side has altCosts and other does not', () => {
    const bgaMap = new Map<string, any>([
      ['X1', { id: 'X1_A', deck: 'X', number: 1, altCosts: [{wood: 1}], banned: false }],
    ])
    const tsMap = new Map<string, any>([
      ['X1', { id: 'X1_A', deck: 'X', number: 1 }],
    ])
    const result = diffCards(bgaMap as never, tsMap as never)
    const altDevs = result.deviations.filter(d => d.field === 'altCosts')
    expect(altDevs).toHaveLength(1)
    expect(altDevs[0].bga).toEqual([{wood: 1}])
  })

  it('no deviation when altCosts arrays match', () => {
    const bgaMap = new Map<string, any>([
      ['X2', { id: 'X2_B', deck: 'X', number: 2, altCosts: [{wood: 1}, {food: 2}], banned: false }],
    ])
    const tsMap = new Map<string, any>([
      ['X2', { id: 'X2_B', deck: 'X', number: 2, altCosts: [{wood: 1}, {food: 2}] }],
    ])
    const result = diffCards(bgaMap as never, tsMap as never)
    expect(result.deviations.filter(d => d.field === 'altCosts')).toEqual([])
  })
})

describe('loadBga canonical pick (integration with parseBgaCard fixtures)', () => {
  it('picks the canonical id when multiple files share deck+number', () => {
    const a = parseBgaCard(path.join(FIXTURE_DIR, 'bga/D11w_LawnFertilizer.php'))
    const b = parseBgaCard(path.join(FIXTURE_DIR, 'bga/D11w_LawnFertilzer.php'))
    const tsIds = new Set(['D11w_LawnFertilizer'])
    const cards = [a, b]
    const tsMatch = cards.find(c => tsIds.has(c.id))
    const picked = tsMatch ?? cards.find(c => !c.banned) ?? cards[0]
    expect(picked.id).toBe('D11w_LawnFertilizer')
    expect(picked.banned).toBe(false)
  })
})

// Guard for §6 infra todo #1: every `$this->field` BGA cards assign must be
// either parsed (covered) or explicitly skipped (ignored). When BGA adds a new
// metadata field, this test fails and tells the developer to either teach
// parse-bga.ts about it or add it to IGNORED_FIELDS — preventing the audit
// baseline from silently drifting.
const COVERED_FIELDS = new Set([
  'name', 'category', 'players', 'extraVp', 'vp',
  'cost', 'costs', 'prerequisite', 'passing', 'banned',
])

const IGNORED_FIELDS = new Set([
  // Derived from filename
  'id', 'deck', 'number',
  // BGA platform / workshop flags — not aligned (see §1 audit rule)
  'implemented', 'bannedLiving', 'bannedWeak',
  'bannedStrong1or2p', 'bannedStrong3or4p',
  'bannedWeak1or2p', 'bannedWeak3or4p',
  'isCorbariusOrDulcinaria', 'isArtifexOrBubulcus',
  'isBakingImprovement', 'isCookery',
  // BGA PHP runtime behaviour (flow / hooks / state holders)
  'accumulation', 'animalHolder', 'holder', 'flow', 'exchanges',
  'field', 'location', 'map', 'privateSpace', 'returnCards',
  'scoresMap', 'sharedScoring', 'resMap', 'replacesCostFor',
  'pId', 'fee', 'bonusStoneRoom',
  // Free-form text / hints not subject to metadata literal diff
  'costText', 'usedText', 'desc', 'rulings', 'author',
  // Conditional / typed prerequisites — OA expresses via card-display schema
  'conditionalCost', 'improvementPrerequisites', 'occupationPrerequisites',
])

describe('BGA metadata field coverage', () => {
  it('every $this->field in BGA A-E card sources is parsed or explicitly ignored', () => {
    let bgaRoot: string
    try {
      bgaRoot = resolveBgaRoot()
    } catch {
      console.warn('BGA repo not found; skipping field-coverage check')
      return
    }
    const cardsRoot = path.join(bgaRoot, 'modules', 'php', 'Cards')
    const fields = new Set<string>()
    for (const deck of ['A', 'B', 'C', 'D', 'E']) {
      const dir = path.join(cardsRoot, deck)
      if (!fs.existsSync(dir)) continue
      for (const f of fs.readdirSync(dir)) {
        if (!/^[A-E]\d.*\.php$/.test(f)) continue
        const src = fs.readFileSync(path.join(dir, f), 'utf8')
        const re = /\$this->(\w+)\s*=/g
        let m: RegExpExecArray | null
        while ((m = re.exec(src))) fields.add(m[1])
      }
    }

    const known = new Set([...COVERED_FIELDS, ...IGNORED_FIELDS])
    const unknown = [...fields].filter(f => !known.has(f)).sort()
    expect(
      unknown,
      `New BGA metadata field(s) detected: ${unknown.join(', ')}. Either parse them in scripts/bga-metadata/parse-bga.ts (and add to COVERED_FIELDS) or list them in IGNORED_FIELDS.`,
    ).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  parseArgs,
  discoverCardPairs,
  scanCard,
  computeLineRatio,
  countLines,
  detectShell,
  scanCoreFilesForCardId,
  scanAggregateMutations,
  scanExternalCardIdMentions,
  scanCrossLayerImports,
  extractOurDesc,
  extractBgaDesc,
  normalizeDesc,
  compareDesc,
} from '../audit-card-architecture'

describe('parseArgs', () => {
  it('uses defaults when no args provided', () => {
    expect(parseArgs([], {})).toEqual({
      ourCardsDir: 'shared/cards',
      bgaCardsDir: '/data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards',
      outputPath: 'output/tmp/audit-card-arch-2026-04-28.jsonl',
      strict: false,
    })
  })

  it('reads BGA_CARDS_DIR / OUR_CARDS_DIR env', () => {
    const env = { BGA_CARDS_DIR: '/x/Cards', OUR_CARDS_DIR: 'src/cards' }
    const out = parseArgs([], env)
    expect(out.ourCardsDir).toBe('src/cards')
    expect(out.bgaCardsDir).toBe('/x/Cards')
  })

  it('--strict sets strict flag', () => {
    expect(parseArgs(['--strict'], {}).strict).toBe(true)
  })
})

describe('discoverCardPairs', () => {
  it('matches our TS files to BGA PHP files by cardId', () => {
    const pairs = discoverCardPairs(
      'shared/cards',
      '/data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards',
    )

    expect(pairs.both.length).toBeGreaterThan(800)

    const pair = pairs.both.find(p => p.cardId === 'A123')
    expect(pair).toBeDefined()
    expect(pair!.ourPath).toMatch(/A123_FrameBuilder\.ts$/)
    expect(pair!.bgaPath).toMatch(/A123_FrameBuilder\.php$/)
  })

  it('reports BGA-only cards (we missed)', () => {
    const pairs = discoverCardPairs(
      'shared/cards',
      '/data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards',
    )
    // E80 is BGA-only at this snapshot (we have not implemented it yet)
    const bgaOnly = pairs.bgaOnly.find(c => c.cardId === 'E80')
    expect(bgaOnly).toBeDefined()
  })
})

describe('scanCard (skeleton)', () => {
  it('returns CardAuditResult with all signal fields initialized', () => {
    const result = scanCard({
      cardId: 'A123',
      deck: 'A',
      ourPath: 'shared/cards/A/A123_FrameBuilder.ts',
      bgaPath: '/data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/A/A123_FrameBuilder.php',
    })

    expect(result.cardId).toBe('A123')
    expect(Array.isArray(result.signals.S1_coreFileMentions)).toBe(true)
    expect(Array.isArray(result.signals.S4_crossLayerImports)).toBe(true)
    expect(Array.isArray(result.signals.S5_aggregateMutations)).toBe(true)
    expect(typeof result.signals.S6_lineRatio).toBe('number')
    expect(Array.isArray(result.signals.S7_externalCardIdMentions)).toBe(true)
    expect(['none', 'low', 'high']).toContain(result.signals.S10_shellLikelihood)
    expect(result.signals.S11_descAlignment).toMatch(/aligned|missing-i18n|diff-from-bga/)
    expect(Array.isArray(result.signals.S12_i18nGapKeys)).toBe(true)
    expect(result.verdict).toBe('pending')
  })
})

describe('computeLineRatio', () => {
  it('returns ourLines / bgaLines', () => {
    expect(computeLineRatio(150, 100)).toBeCloseTo(1.5)
  })

  it('returns Infinity when BGA has 0 lines', () => {
    expect(computeLineRatio(50, 0)).toBe(Infinity)
  })

  it('returns 0 when our file has 0 lines', () => {
    expect(computeLineRatio(0, 100)).toBe(0)
  })
})

describe('countLines', () => {
  it('counts non-empty lines in a real file', () => {
    const n = countLines('shared/cards/A/A123_FrameBuilder.ts')
    expect(n).toBeGreaterThan(0)
  })
})

describe('detectShell (S10)', () => {
  it('returns none when our file has hooks AND BGA has hooks', () => {
    const ours = `
      registerCardListener({ id: 'A123', actions: ['construct'], handler: () => {} })
    `
    const bga = `
      class A123_FrameBuilder { function execute() { return 1; } }
    `
    const r = detectShell(ours, bga)
    expect(r.likelihood).toBe('none')
    expect(r.evidence.hookCount).toBe(1)
    expect(r.evidence.bgaHookCount).toBeGreaterThan(0)
  })

  it('returns high when our file has no hooks but BGA has execute()', () => {
    const ours = `export const A1 = new MinorImprovement({ id: 'A1' })`
    const bga = `class A1 { function execute() { do_something(); something_else(); } }`
    const r = detectShell(ours, bga)
    expect(r.likelihood).toBe('high')
    expect(r.evidence.hookCount).toBe(0)
  })

  it('returns low when both empty (data-only on both sides)', () => {
    const ours = `export const A1 = new MinorImprovement({ id: 'A1' })`
    const bga = `class A1 { /* no hooks */ }`
    const r = detectShell(ours, bga)
    expect(r.likelihood).toBe('low')
  })
})

describe('scanCoreFilesForCardId (S1)', () => {
  it('returns empty list when card id not in any core file', () => {
    const hits = scanCoreFilesForCardId('A123', '.')
    expect(Array.isArray(hits)).toBe(true)
  })

  it('returns hits with file/line/snippet when cardId is in core file', () => {
    const tmp = path.join('output', 'tmp', 'test-core.ts')
    fs.mkdirSync(path.dirname(tmp), { recursive: true })
    fs.writeFileSync(tmp, 'if (cardId === "A999") { /* main path branch */ }\n')
    const hits = scanCoreFilesForCardId('A999', '.', [tmp])
    expect(hits.length).toBe(1)
    expect(hits[0].file).toBe(tmp)
    expect(hits[0].line).toBe(1)
    expect(hits[0].snippet).toContain('A999')
    fs.unlinkSync(tmp)
  })
})

describe('scanAggregateMutations (S5)', () => {
  it('flags direct player.fences assignment', () => {
    const tmp = path.join('output', 'tmp', 'test-mut.ts')
    fs.mkdirSync(path.dirname(tmp), { recursive: true })
    fs.writeFileSync(tmp, `player.fences = []\nplayer.fences.push(seg)\n`)
    const hits = scanAggregateMutations(tmp)
    expect(hits.length).toBeGreaterThanOrEqual(1)
    expect(hits[0].field).toBe('player.fences')
    fs.unlinkSync(tmp)
  })

  it('does not flag cardStates writes', () => {
    const tmp = path.join('output', 'tmp', 'test-mut2.ts')
    fs.mkdirSync(path.dirname(tmp), { recursive: true })
    fs.writeFileSync(tmp, `player.cardStates['A123'] = { flagged: true }\n`)
    const hits = scanAggregateMutations(tmp)
    expect(hits.length).toBe(0)
    fs.unlinkSync(tmp)
  })

  it('does not flag reads (player.fences.length)', () => {
    const tmp = path.join('output', 'tmp', 'test-mut3.ts')
    fs.mkdirSync(path.dirname(tmp), { recursive: true })
    fs.writeFileSync(tmp, `if (player.fences.length > 0) {}\n`)
    const hits = scanAggregateMutations(tmp)
    expect(hits.length).toBe(0)
    fs.unlinkSync(tmp)
  })
})

describe('scanExternalCardIdMentions (S7)', () => {
  it('returns hits in shared/ files outside shared/cards/{deck}/', () => {
    const tmpDir = path.join('output', 'tmp', 'test-shared', 'shared', 'actions')
    fs.mkdirSync(tmpDir, { recursive: true })
    const tmp = path.join(tmpDir, 'evil.ts')
    fs.writeFileSync(tmp, `if (player.minorPlayed.includes('A999')) {}\n`)
    const hits = scanExternalCardIdMentions('A999', path.join('output', 'tmp', 'test-shared'))
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].file).toContain('evil.ts')
    fs.rmSync(path.join('output', 'tmp', 'test-shared'), { recursive: true })
  })

  it('skips shared/cards/{deck}/ files (legit references)', () => {
    const tmpDir = path.join('output', 'tmp', 'test-shared2', 'shared', 'cards', 'A')
    fs.mkdirSync(tmpDir, { recursive: true })
    const tmp = path.join(tmpDir, 'A999_Test.ts')
    fs.writeFileSync(tmp, `export const A999 = { id: 'A999' }\n`)
    const hits = scanExternalCardIdMentions('A999', path.join('output', 'tmp', 'test-shared2'))
    expect(hits.length).toBe(0)
    fs.rmSync(path.join('output', 'tmp', 'test-shared2'), { recursive: true })
  })
})

describe('scanCrossLayerImports (S4)', () => {
  it('flags imports from server/', () => {
    const tmp = path.join('output', 'tmp', 'test-imp.ts')
    fs.mkdirSync(path.dirname(tmp), { recursive: true })
    fs.writeFileSync(tmp, `import { foo } from '../../../server/game-session'\n`)
    const hits = scanCrossLayerImports(tmp)
    expect(hits.length).toBe(1)
    expect(hits[0].to).toContain('server/')
    fs.unlinkSync(tmp)
  })

  it('flags imports from client/', () => {
    const tmp = path.join('output', 'tmp', 'test-imp2.ts')
    fs.mkdirSync(path.dirname(tmp), { recursive: true })
    fs.writeFileSync(tmp, `import { Bar } from '../../../client/services/game'\n`)
    const hits = scanCrossLayerImports(tmp)
    expect(hits.length).toBe(1)
    expect(hits[0].to).toContain('client/')
    fs.unlinkSync(tmp)
  })

  it('does NOT flag imports within shared/', () => {
    const tmp = path.join('output', 'tmp', 'test-imp3.ts')
    fs.mkdirSync(path.dirname(tmp), { recursive: true })
    fs.writeFileSync(tmp, `import { Resource } from '../../game/types'\n`)
    const hits = scanCrossLayerImports(tmp)
    expect(hits.length).toBe(0)
    fs.unlinkSync(tmp)
  })
})

describe('normalizeDesc', () => {
  it('decodes JS escapes', () => {
    expect(normalizeDesc('foo\\u00a0bar')).toBe('foo bar')
  })

  it('replaces curly quotes with straight', () => {
    expect(normalizeDesc('"foo" ‘bar’')).toBe(`"foo" 'bar'`)
  })

  it('collapses whitespace', () => {
    expect(normalizeDesc('  foo   bar  ')).toBe('foo bar')
  })
})

describe('compareDesc', () => {
  it('returns aligned when both texts equal post-normalize', () => {
    expect(compareDesc('foo', 'foo')).toBe('aligned')
  })

  it('returns diff-from-bga when texts differ', () => {
    expect(compareDesc('foo', 'bar')).toBe('diff-from-bga')
  })

  it('returns missing-i18n when ours is empty', () => {
    expect(compareDesc('', 'bar')).toBe('missing-i18n')
  })
})

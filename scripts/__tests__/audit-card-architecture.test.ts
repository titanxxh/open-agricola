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
    expect(result.signals.S1_coreFileMentions).toEqual([])
    expect(result.signals.S4_crossLayerImports).toEqual([])
    expect(result.signals.S5_aggregateMutations).toEqual([])
    expect(typeof result.signals.S6_lineRatio).toBe('number')
    expect(result.signals.S7_externalCardIdMentions).toEqual([])
    expect(['none', 'low', 'high']).toContain(result.signals.S10_shellLikelihood)
    expect(result.signals.S11_descAlignment).toMatch(/aligned|missing-i18n|diff-from-bga/)
    expect(result.signals.S12_i18nGapKeys).toEqual([])
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

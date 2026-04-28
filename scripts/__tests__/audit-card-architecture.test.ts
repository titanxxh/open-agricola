import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parseArgs, discoverCardPairs } from '../audit-card-architecture'

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

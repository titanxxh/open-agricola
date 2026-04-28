import { describe, it, expect } from 'vitest'
import { parseArgs } from '../audit-card-architecture'

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

import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { createRng, createSeed, createSeededRng, resolveSeed } from '../rng'

const draws = (rng: () => number, count: number): number[] =>
  Array.from({ length: count }, () => rng())

describe('createSeed', () => {
  it('draws a fresh 128-bit wide seed each time', () => {
    const first = createSeed()
    const second = createSeed()

    expect(first).toMatch(/^[0-9a-f]{32}$/)
    expect(second).toMatch(/^[0-9a-f]{32}$/)
    expect(first).not.toBe(second)
  })
})

describe('resolveSeed', () => {
  it('keeps an Explicit Seed as a whole number', () => {
    expect(resolveSeed(42)).toBe(42)
    expect(resolveSeed(42.9)).toBe(42)
  })

  it('keeps a wide seed unchanged', () => {
    expect(resolveSeed('00112233445566778899aabbccddeeff')).toBe('00112233445566778899aabbccddeeff')
  })

  it('draws a wide seed when none is usable', () => {
    for (const missing of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY, '']) {
      expect(resolveSeed(missing)).toMatch(/^[0-9a-f]{32}$/)
    }
  })
})

describe('createSeededRng with an Explicit Seed', () => {
  it('keeps the output of the numeric generator fixed', () => {
    expect(draws(createRng(42), 3)).toEqual([
      0.6011037519201636,
      0.44829055899754167,
      0.8524657934904099,
    ])
  })

  it('ignores the label and applies the call site arithmetic', () => {
    expect(draws(createSeededRng(42, 'deal-hands'), 5)).toEqual(draws(createRng(42), 5))
    expect(draws(createSeededRng(42, 'round-action-order'), 5)).toEqual(draws(createRng(42), 5))
    expect(draws(createSeededRng(42, 'moor-start-cards', (seed) => seed + 7), 5))
      .toEqual(draws(createRng(49), 5))
  })
})

describe('createSeededRng with a wide seed', () => {
  const seed = '00112233445566778899aabbccddeeff'

  it('matches HMAC-SHA256 in counter mode over the label', () => {
    // Reference: block i = HMAC(seed, label || 0x00 || uint32be(i)); each draw is 8 bytes.
    const block = (counter: number): Buffer => {
      const index = Buffer.alloc(4)
      index.writeUInt32BE(counter)
      return createHmac('sha256', seed)
        .update(Buffer.concat([Buffer.from('deal-hands\u0000', 'utf8'), index]))
        .digest()
    }
    const stream = Buffer.concat([block(0), block(1)])
    const expected = Array.from({ length: 8 }, (_, index) => {
      const high = stream.readUInt32BE(index * 8) >>> 5
      const low = stream.readUInt32BE(index * 8 + 4) >>> 6
      return (high * 67108864 + low) / 9007199254740992
    })

    // Four draws per 32-byte block, so eight draws cross into the second block.
    expect(draws(createSeededRng(seed, 'deal-hands'), 8)).toEqual(expected)
  })

  it('is repeatable and stays inside [0, 1)', () => {
    const first = draws(createSeededRng(seed, 'deal-hands'), 200)

    expect(draws(createSeededRng(seed, 'deal-hands'), 200)).toEqual(first)
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true)
  })

  it('separates streams by label and by seed', () => {
    const base = draws(createSeededRng(seed, 'deal-hands'), 8)

    expect(draws(createSeededRng(seed, 'round-action-order'), 8)).not.toEqual(base)
    expect(draws(createSeededRng('ffeeddccbbaa99887766554433221100', 'deal-hands'), 8)).not.toEqual(base)
  })

  it('never falls back to the numeric generator', () => {
    const ignored = (): number => {
      throw new Error('the Explicit Seed arithmetic must not run for a wide seed')
    }

    expect(() => createSeededRng(seed, 'deal-hands', ignored)()).not.toThrow()
  })
})

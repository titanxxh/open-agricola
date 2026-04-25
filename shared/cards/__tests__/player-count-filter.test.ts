import { describe, expect, it } from 'vitest'
import { cardAllowedForPlayerCount } from '../player-count-filter'

describe('cardAllowedForPlayerCount', () => {
  it('returns true for undefined / empty (no restriction)', () => {
    expect(cardAllowedForPlayerCount(undefined, 1)).toBe(true)
    expect(cardAllowedForPlayerCount(undefined, 4)).toBe(true)
    expect(cardAllowedForPlayerCount('', 2)).toBe(true)
  })

  it('parses N+ (greater-or-equal)', () => {
    expect(cardAllowedForPlayerCount('3+', 2)).toBe(false)
    expect(cardAllowedForPlayerCount('3+', 3)).toBe(true)
    expect(cardAllowedForPlayerCount('3+', 4)).toBe(true)
    expect(cardAllowedForPlayerCount('4+', 3)).toBe(false)
    expect(cardAllowedForPlayerCount('4+', 4)).toBe(true)
    expect(cardAllowedForPlayerCount('5+', 4)).toBe(false)
    expect(cardAllowedForPlayerCount('5+', 5)).toBe(true)
    expect(cardAllowedForPlayerCount('1+', 1)).toBe(true)
  })

  it('parses N-M (closed range)', () => {
    expect(cardAllowedForPlayerCount('1-3', 1)).toBe(true)
    expect(cardAllowedForPlayerCount('1-3', 3)).toBe(true)
    expect(cardAllowedForPlayerCount('1-3', 4)).toBe(false)
    expect(cardAllowedForPlayerCount('2-4', 1)).toBe(false)
    expect(cardAllowedForPlayerCount('2-4', 2)).toBe(true)
    expect(cardAllowedForPlayerCount('2-4', 4)).toBe(true)
  })

  it('parses exact N (single value)', () => {
    expect(cardAllowedForPlayerCount('4', 3)).toBe(false)
    expect(cardAllowedForPlayerCount('4', 4)).toBe(true)
    expect(cardAllowedForPlayerCount('4', 5)).toBe(false)
  })

  it('tolerates surrounding whitespace', () => {
    expect(cardAllowedForPlayerCount('  3+  ', 3)).toBe(true)
    expect(cardAllowedForPlayerCount('  3+  ', 2)).toBe(false)
    expect(cardAllowedForPlayerCount(' 1-3 ', 4)).toBe(false)
  })

  it('fails open on unknown formats', () => {
    expect(cardAllowedForPlayerCount('abc', 2)).toBe(true)
    expect(cardAllowedForPlayerCount('3+5', 4)).toBe(true)
    expect(cardAllowedForPlayerCount('3-', 3)).toBe(true)
    expect(cardAllowedForPlayerCount('-3', 3)).toBe(true)
    expect(cardAllowedForPlayerCount('3 +', 3)).toBe(true)
  })
})

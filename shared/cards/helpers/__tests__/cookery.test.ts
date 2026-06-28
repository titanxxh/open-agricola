import { describe, it, expect } from 'vitest'
import { getPlayerCookeryCards } from '../cookery'
import type { PlayerState } from '../../../contract/types'

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  improvements: [],
  minorPlayed: [],
  occupationPlayed: [],
  ...overrides,
} as unknown as PlayerState)

describe('getPlayerCookeryCards', () => {
  it('returns major cookery improvements', () => {
    const p = makePlayer({ improvements: ['Major_Fireplace1', 'Major_Joinery'] })
    const out = getPlayerCookeryCards(p)
    expect(out.map((c) => c.id)).toEqual(['Major_Fireplace1'])
  })

  it('returns minor cookery improvements (e.g. A60 OrientalFireplace)', () => {
    const p = makePlayer({ minorPlayed: ['A060_OrientalFireplace'] })
    const out = getPlayerCookeryCards(p)
    expect(out.map((c) => c.id)).toEqual(['A060_OrientalFireplace'])
  })

  it('combines majors and minors', () => {
    const p = makePlayer({
      improvements: ['Major_CookingHearth1'],
      minorPlayed: ['D059_EarthOven'],
    })
    const out = getPlayerCookeryCards(p)
    const ids = out.map((c) => c.id)
    expect(ids).toContain('Major_CookingHearth1')
    expect(ids).toContain('D059_EarthOven')
    expect(out.length).toBe(2)
  })

  it('skips non-cookery improvements', () => {
    const p = makePlayer({
      improvements: ['Major_StoneOven', 'Major_Joinery'],
      minorPlayed: ['B027_Toolbox'],
    })
    const out = getPlayerCookeryCards(p)
    expect(out).toHaveLength(0)
  })

  it('exposes exchanges metadata for derived trade computation', () => {
    const p = makePlayer({ improvements: ['Major_Fireplace1'] })
    const out = getPlayerCookeryCards(p)
    expect(out[0].exchanges).toBeDefined()
    expect(out[0].exchanges?.some((ex) => ex.from?.vegetable === 1)).toBe(true)
  })
})

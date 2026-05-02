import { describe, it, expect } from 'vitest'
import { pairedSpaceIdFor } from '../space-pairing'
import type { GameState } from '../../../game/types'

const makeState = (spaceIds: string[]): GameState =>
  ({
    actionSpaces: spaceIds.map((id) => ({ id })),
  } as unknown as GameState)

describe('pairedSpaceIdFor', () => {
  it('1-3p: returns [base] for hollow', () => {
    const state = makeState(['hollow'])
    expect(pairedSpaceIdFor(state, 'hollow')).toEqual(['hollow'])
  })

  it('4p: returns [base, variant] when hollow-4 present', () => {
    const state = makeState(['hollow', 'hollow-4'])
    expect(pairedSpaceIdFor(state, 'hollow')).toEqual(['hollow', 'hollow-4'])
  })

  it('lessons-4p: returns [base, variant]', () => {
    const state = makeState(['lessons', 'lessons-4'])
    expect(pairedSpaceIdFor(state, 'lessons')).toEqual(['lessons', 'lessons-4'])
  })

  it('grove: no variant in any player count', () => {
    const state = makeState(['grove'])
    expect(pairedSpaceIdFor(state, 'grove')).toEqual(['grove'])
  })

  it('returns [base] when variant declared but absent from state', () => {
    const state = makeState(['hollow'])
    expect(pairedSpaceIdFor(state, 'hollow')).toEqual(['hollow'])
  })
})

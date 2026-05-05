import { describe, expect, it } from 'vitest'
import type { GameState } from '../../../game/types.ts'
import { computeCardDraftPending } from '../draft.ts'

describe('draft phase helpers', () => {
  it('returns null when phase is not draft', () => {
    const state = { phase: 'work', draft: null } as unknown as GameState
    expect(computeCardDraftPending(state)).toBeNull()
  })

  it('returns null when draft data missing', () => {
    const state = { phase: 'draft', draft: null } as unknown as GameState
    expect(computeCardDraftPending(state)).toBeNull()
  })

  it('reports allSubmitted=true when every seat has occ + minor picks', () => {
    const state = {
      phase: 'draft',
      draft: {
        round: 2,
        totalRounds: 4,
        seatOrder: ['p0', 'p1'],
        pendingPicks: {
          p0: { occ: 'occ-a', minor: 'min-x' },
          p1: { occ: 'occ-b', minor: 'min-y' },
        },
      },
    } as unknown as GameState
    expect(computeCardDraftPending(state)).toEqual({
      type: 'cardDraft',
      round: 2,
      totalRounds: 4,
      allSubmitted: true,
    })
  })

  it('reports allSubmitted=false when any seat is missing one pick', () => {
    const state = {
      phase: 'draft',
      draft: {
        round: 1,
        totalRounds: 4,
        seatOrder: ['p0', 'p1'],
        pendingPicks: {
          p0: { occ: 'occ-a', minor: null },
          p1: { occ: 'occ-b', minor: 'min-y' },
        },
      },
    } as unknown as GameState
    expect(computeCardDraftPending(state)).toEqual({
      type: 'cardDraft',
      round: 1,
      totalRounds: 4,
      allSubmitted: false,
    })
  })
})

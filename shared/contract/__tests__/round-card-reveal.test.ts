import { describe, expect, it } from 'vitest'

import { revealedRoundSlots, roundCardActionIds, roundStageActions, roundStageSlots } from '../state-constants'

const revealedRounds = (round: number): number[] =>
  revealedRoundSlots(round)
    .map((revealed, index) => (revealed ? index + 1 : null))
    .filter((value): value is number => value !== null)

describe('revealedRoundSlots', () => {
  it('covers all fourteen rounds', () => {
    expect(revealedRoundSlots(1)).toHaveLength(14)
    expect(roundStageSlots.reduce((total, { count }) => total + count, 0)).toBe(14)
  })

  it('reveals a round card when its round starts', () => {
    // Round 14 is the only card of its stage, so it is always deducible.
    expect(revealedRounds(1)).toEqual([1, 14])
    expect(revealedRounds(2)).toEqual([1, 2, 14])
  })

  it('reveals the last face-down card of a stage one round early', () => {
    // Stage 1 is rounds 1-4: once three are up, the fourth is known.
    expect(revealedRounds(3)).toEqual([1, 2, 3, 4, 14])
    // Stage 2 is rounds 5-7.
    expect(revealedRounds(5)).toEqual([1, 2, 3, 4, 5, 14])
    expect(revealedRounds(6)).toEqual([1, 2, 3, 4, 5, 6, 7, 14])
    // Stage 3 is rounds 8-9: revealing round 8 gives away round 9.
    expect(revealedRounds(8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 14])
  })

  it('reveals everything in the last round', () => {
    expect(revealedRoundSlots(14).every(Boolean)).toBe(true)
  })
})

describe('roundCardActionIds', () => {
  it('lists every round card once', () => {
    expect(roundCardActionIds).toHaveLength(14)
    expect(new Set(roundCardActionIds).size).toBe(14)
    expect([...roundCardActionIds].sort()).toEqual(Object.values(roundStageActions).flat().sort())
  })
})

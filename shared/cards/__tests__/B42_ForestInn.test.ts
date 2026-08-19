import { describe, expect, it } from 'vitest'
import { B042_ForestInn } from '../../cards/B/B042_ForestInn'
import { meetsCardPrerequisites } from '../helpers/prerequisites'
import type { PlayerState } from '../../contract/types'

describe('B042_ForestInn definition', () => {
  it('declares maxRound: 6 (reference isBuyable refuses turn > 6)', () => {
    expect(B042_ForestInn.maxRound).toBe(6)
  })

  it('vp: 1', () => {
    expect(B042_ForestInn.vp).toBe(1)
  })

  it('keeps the printed prerequisite text', () => {
    expect(B042_ForestInn.prerequisite).toBe('Play in Round 6 or Before')
  })
})

describe('B042_ForestInn round-gate via meetsCardPrerequisites', () => {
  const player = {
    occupationPlayed: [],
    minorPlayed: [],
    improvements: [],
    cardStates: {},
  } as unknown as PlayerState

  it('round 6: still buyable', () => {
    expect(meetsCardPrerequisites(player, B042_ForestInn, 6)).toBe(true)
  })
  it('round 7: not buyable', () => {
    expect(meetsCardPrerequisites(player, B042_ForestInn, 7)).toBe(false)
  })
  it('round 1: buyable', () => {
    expect(meetsCardPrerequisites(player, B042_ForestInn, 1)).toBe(true)
  })
})

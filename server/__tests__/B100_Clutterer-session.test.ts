import { describe, expect, it } from 'vitest'
import { playOccupation, setupOccupationSession } from './_helpers/batch07-card-play'

import '../../shared/cards/A/A116_WoodCutter'
import '../../shared/cards/A/A125_Priest'
import '../../shared/cards/B/B100_Clutterer'

describe('B100 Clutterer through Session', () => {
  it('gives one point for a later accumulation-space occupation only', () => {
    const matching = setupOccupationSession({
      cardId: 'A116_WoodCutter', played: ['B100_Clutterer'], hand: ['A116_WoodCutter'], food: 1,
    })
    const rewarded = playOccupation(matching, 'A116_WoodCutter')
    expect(rewarded.state.players[0]!.cardStates.B100_Clutterer?.counters?.bonusVp).toBe(1)

    const unrelated = setupOccupationSession({
      cardId: 'A125_Priest', played: ['B100_Clutterer'], hand: ['A125_Priest'], food: 1,
    })
    const notRewarded = playOccupation(unrelated, 'A125_Priest')
    expect(notRewarded.state.players[0]!.cardStates.B100_Clutterer?.counters?.bonusVp ?? 0).toBe(0)
  })
})

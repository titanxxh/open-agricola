import { describe, expect, it } from 'vitest'
import { playOccupation, setupOccupationSession } from './_helpers/batch07-card-play'

import '../../shared/cards/E/E101_Blighter'

describe('E101 Blighter through Session', () => {
  it.each([
    [1, 5], [5, 4], [8, 3], [11, 2], [13, 1], [14, 0],
  ])('gives the round %i reward of %i points', (round, expected) => {
    const response = playOccupation(setupOccupationSession({ cardId: 'E101_Blighter', round }), 'E101_Blighter')
    expect(response.state.players[0]!.occupationPlayed).toContain('E101_Blighter')
    expect(response.state.players[0]!.cardStates.E101_Blighter?.counters?.bonusVp ?? 0).toBe(expected)
  })
})

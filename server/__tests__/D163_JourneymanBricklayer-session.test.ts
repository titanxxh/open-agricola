import { describe, expect, it } from 'vitest'
import { playOccupation, setupOccupationSession } from './_helpers/batch07-card-play'

import '../../shared/cards/D/D163_JourneymanBricklayer'

describe('D163 Journeyman Bricklayer through Session', () => {
  it('gives two stone exactly once when played', () => {
    const session = setupOccupationSession({ cardId: 'D163_JourneymanBricklayer', playerCount: 4 })
    const response = playOccupation(session, 'D163_JourneymanBricklayer')
    expect(response.state.players[0]!.occupationPlayed).toContain('D163_JourneymanBricklayer')
    expect(response.state.players[0]!.resources.stone).toBe(2)
    session.loadState(response.state)
    expect(session.getState().state.players[0]!.resources.stone).toBe(2)
  })
})

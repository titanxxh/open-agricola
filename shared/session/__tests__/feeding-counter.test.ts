import { describe, it, expect } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import { startBreedPhase } from '../phases/harvest'

describe('GameState.completedFeedingPhases', () => {
  it('initializes to 0 on a new 2-player game', () => {
    const session = new GameSession(42)
    expect(session.state.completedFeedingPhases).toBe(0)
  })

  it('increments each time startBreedPhase is invoked', () => {
    const session = new GameSession(42)
    expect(session.state.completedFeedingPhases).toBe(0)

    startBreedPhase(session)
    expect(session.state.completedFeedingPhases).toBe(1)

    startBreedPhase(session)
    expect(session.state.completedFeedingPhases).toBe(2)
  })
})

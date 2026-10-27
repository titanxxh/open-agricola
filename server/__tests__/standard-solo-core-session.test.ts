import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession } from '../game/authoritative-session'
import { createOpeningSession } from './_helpers/session-fixtures'

const sessions: GameSession[] = []
afterEach(() => { for (const session of sessions.splice(0)) session.dispose() })

describe('standard solo core rules', () => {
  it.each([
    { playerCount: 1, food: [0] },
    { playerCount: 2, food: [2, 3] },
  ])('starts $playerCount actual players with the corresponding food', ({ playerCount, food }) => {
    const session = createOpeningSession({
      seed: 42,
      options: { playerCount, deckIds: ['A'] },
      expected: { phase: 'playing', roundPhase: 'work', interaction: { stateId: 'idle' } },
    })
    sessions.push(session)

    const response = session.getState()
    expect(response.state.players).toHaveLength(playerCount)
    expect(response.state.players.map(player => player.resources.food)).toEqual(food)
    expect(response.state.players.every(player => player.minorHand.length === 7 && player.occupationHand.length === 7)).toBe(true)
    expect(response.state.players.every(player => player.minorPlayed.length === 0 && player.occupationPlayed.length === 0)).toBe(true)
    expect(response.state.actionSpaces.every(space => space.takenBy.length === 0)).toBe(true)
  })
})

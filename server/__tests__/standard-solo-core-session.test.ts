import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession } from '../game/authoritative-session'
import { createOpeningSession, createWorkSession } from './_helpers/session-fixtures'

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

  it('uses the common two-player board for one actual player', () => {
    const solo = createWorkSession({ options: { playerCount: 1 } })
    const multiplayer = createWorkSession({ options: { playerCount: 2 } })
    sessions.push(solo, multiplayer)

    const actionIds = (session: GameSession) => session.getState().state.actionSpaces.map(space => space.id).sort()
    expect(actionIds(solo)).toEqual(actionIds(multiplayer))
    expect(actionIds(solo)).toEqual(expect.arrayContaining([
      'forest', 'clay-pit', 'reed-bank', 'fishing', 'day-laborer',
      'meeting-place', 'lessons', 'farmland', 'grain-seeds', 'farm-expansion',
    ]))
    expect(solo.getState().state.players).toHaveLength(1)
  })

  it.each([1, 2])('executes common resource actions with %i actual players', playerCount => {
    for (const { spaceId, reward } of [
      { spaceId: 'clay-pit', reward: { clay: 1 } },
      { spaceId: 'reed-bank', reward: { reed: 1 } },
      { spaceId: 'fishing', reward: { food: 1 } },
      { spaceId: 'day-laborer', reward: { food: 2 } },
      { spaceId: 'grain-seeds', reward: { grain: 1 } },
    ]) {
      const session = createWorkSession({ options: { playerCount }, configure(state) {
        state.players[0]!.resources.food = 0
      } })
      sessions.push(session)
      const before = session.getState()
      const logLength = before.state.log.length
      const response = session.takeAction(0, spaceId)

      expect(response.ok, response.error).toBe(true)
      expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
      expect(response.state.players[0]!.resources).toMatchObject(reward)
      expect(response.state.actionSpaces.find(space => space.id === spaceId)?.takenBy).toEqual([{ playerId: 'p1', workerId: '1' }])
      expect(response.state.log.length).toBeGreaterThan(logLength)
      expect(response.scores![0]!.total - before.scores![0]!.total).toBe(spaceId === 'grain-seeds' ? 2 : 0)
    }
  })
})

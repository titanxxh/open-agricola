import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession } from '../game/authoritative-session'
import { createDefaultRoomTiles } from '../../shared/domain/farm'
import { setActiveWorkerCount } from '../../shared/domain/player'
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

  it.each([
    { playerCount: 1, food: 13, paid: 7 },
    { playerCount: 2, food: 15, paid: 5 },
  ])('settles two adults and a newborn at $playerCount players through the harvest', ({ playerCount, food, paid }) => {
    const session = createWorkSession({ options: { playerCount }, configure(state) {
      const player = state.players[0]!
      player.resources.food = 20
      player.rooms = 3
      player.roomTiles = createDefaultRoomTiles(3)
      setActiveWorkerCount(player, 3)
      player.workers[2]!.isNewborn = true
      state.round = 4
      for (const [index, entry] of state.players.entries()) {
        entry.resources.food = 20
        const spaces = index === 0 ? ['forest', 'clay-pit'] : ['reed-bank', 'fishing']
        for (const [workerIndex, id] of spaces.entries()) {
          const space = state.actionSpaces.find(candidate => candidate.id === id)
          assert.ok(space)
          space.takenBy.push({ playerId: entry.id, workerId: entry.workers[workerIndex]!.id })
        }
      }
    } })
    sessions.push(session)
    const scores = session.getState().scores

    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources).toMatchObject({ food, begging: 0 })
    expect(response.state.players[0]!.workers[2]!.isNewborn).toBe(false)
    if (playerCount === 2) expect(response.state.players[1]!.resources.food).toBe(16)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.paid', actorPlayerId: 'p1', paymentFor: 'feeding', resources: { food: paid },
    }))
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.harvestFeedDetail', params: expect.objectContaining({ resources: { food: paid } }),
    }))
    expect(response.scores).toEqual(scores)
  })
})

import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { createDefaultRoomTiles } from '../../shared/domain/farm'
import { setActiveWorkerCount, workersAvailable } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { createOpeningSession, createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot } from './_helpers/session-assertions'
import { computeHarvestFeedingRequirement } from '../../shared/actions/helpers/harvest-feeding-requirement'

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
    { playerCount: 1, toy: 'none', newborn: true, food: 13, paid: 7 },
    { playerCount: 2, toy: 'none', newborn: true, food: 15, paid: 5 },
    { playerCount: 1, toy: 'played', newborn: true, food: 12, paid: 8 },
    { playerCount: 2, toy: 'played', newborn: true, food: 14, paid: 6 },
    { playerCount: 1, toy: 'hand', newborn: true, food: 13, paid: 7 },
    { playerCount: 2, toy: 'hand', newborn: true, food: 15, paid: 5 },
    { playerCount: 1, toy: 'played', newborn: false, food: 11, paid: 9 },
    { playerCount: 2, toy: 'played', newborn: false, food: 14, paid: 6 },
  ])('settles three people at $playerCount players with Toy $toy and newborn $newborn', ({ playerCount, toy, newborn, food, paid }) => {
    const session = createWorkSession({ options: { playerCount }, configure(state) {
      const player = state.players[0]!
      player.resources.food = 20
      player.rooms = 3
      player.roomTiles = createDefaultRoomTiles(3)
      setActiveWorkerCount(player, 3)
      player.workers[2]!.isNewborn = newborn
      if (toy === 'played') player.minorPlayed = ['E030_ChildsToy']
      if (toy === 'hand') player.minorHand = ['E030_ChildsToy']
      state.round = 4
      for (const [index, entry] of state.players.entries()) {
        entry.resources.food = 20
        const spaces = index === 0 ? ['forest', 'clay-pit'] : ['reed-bank', 'fishing']
        if (index === 0 && !newborn) spaces.push('day-laborer')
        for (const [workerIndex, id] of spaces.entries()) {
          const space = state.actionSpaces.find(candidate => candidate.id === id)
          assert.ok(space)
          space.takenBy.push({ playerId: entry.id, workerId: entry.workers[workerIndex]!.id })
        }
      }
    } })
    sessions.push(session)
    const scores = session.getState().scores
    expect(session.withCtx(() => computeHarvestFeedingRequirement(session.state, session.state.players[0]!))).toBe(paid)

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
    expect(session.withCtx(() => computeHarvestFeedingRequirement(session.state, session.state.players[0]!)))
      .toBe(playerCount === 1 ? 9 : 6)
  })

  it.each([
    { playerCount: 1, food: 0, begging: 1, paid: 6 },
    { playerCount: 2, food: 1, begging: 0, paid: 5 },
  ])('settles six food for two adults and a newborn at $playerCount players without duplicate payment', ({ playerCount, food, begging, paid }) => {
    const session = createWorkSession({ options: { playerCount }, configure(state) {
      state.round = 4
      const player = state.players[0]!
      player.rooms = 3
      player.roomTiles = createDefaultRoomTiles(3)
      setActiveWorkerCount(player, 3)
      player.workers[2]!.isNewborn = true
      for (const [index, entry] of state.players.entries()) {
        entry.resources.food = index === 0 ? 6 : 20
        for (const [workerIndex, id] of (index === 0 ? ['forest', 'clay-pit'] : ['reed-bank', 'fishing']).entries()) {
          state.actionSpaces.find(space => space.id === id)!.takenBy.push({ playerId: entry.id, workerId: entry.workers[workerIndex]!.id })
        }
      }
    } })
    sessions.push(session)
    let response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait') {
      assert.ok(response.interaction.request.kind === 'feed')
      expect(response.interaction.request.remaining).toBe(1)
      response = session.resolveChoice(0, 'confirm', { selections: [] })
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources).toMatchObject({ food, begging })
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.actorPlayerId === 'p1' && event.paymentFor === 'feeding'))
      .toEqual([expect.objectContaining({ resources: begging ? { food: paid, begging } : { food: paid } })])
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.harvestFeedDetail', params: expect.objectContaining({ resources: begging ? { food: paid, begging } : { food: paid } }),
    }))
    expect(response.scores![0]!.categories).toContainEqual(expect.objectContaining({ key: 'beggings', total: -3 * begging }))
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'confirm', { selections: [] }))
  })

  it('keeps solo confirmation and undo boundaries across recovery', () => {
    const original = createWorkSession({ options: { playerCount: 1 } })
    sessions.push(original)
    const before = undoRuleSnapshot(original.getState())
    const first = original.takeAction(0, 'forest')
    expect(first.ok, first.error).toBe(true)
    expect(first.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player', nextPlayerIndex: 0 } })
    expect(first.state.players[0]!.resources.wood).toBe(2)

    const saved = serializeSessionSnapshot(original.state, original)
    const session = new GameSession(rehydrateState(structuredClone(saved)))
    sessions.push(session)
    expect(session.getState().interaction).toEqual(first.interaction)
    expect(session.getState().state.players[0]!.resources.food).toBe(0)
    assertUndoRestored(before, session.undoAction())

    const repeated = session.takeAction(0, 'forest')
    const confirmed = confirmNext(session, repeated)
    expect(confirmed.interaction.stateId).toBe('idle')
    expect(confirmed.state.round).toBe(1)
    expect(confirmed.state.currentPlayerIndex).toBe(0)
    expect(workersAvailable(confirmed.state, confirmed.state.players[0]!)).toBe(1)
    expect(confirmed.state.players[0]!.resources.wood).toBe(2)
    assertRejectedUnchanged(session, () => session.undoAction())

    const last = session.takeAction(0, 'clay-pit')
    expect(last.ok, last.error).toBe(true)
    expect(last.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(last.state.round).toBe(1)
    expect(last.state.events.some(event => event.type === 'returnHome.started')).toBe(false)
    const nextRound = confirmNext(session, last)
    expect(nextRound.state.round).toBe(2)
    expect(nextRound.interaction.stateId).toBe('idle')
    expect(workersAvailable(nextRound.state, nextRound.state.players[0]!)).toBe(2)
    expect(nextRound.state.log).toContainEqual(expect.objectContaining({
      key: 'log.actionDetail', params: expect.objectContaining({
        action: 'actions.forest.name', detailParts: expect.objectContaining({ gains: { wood: 2 } }),
      }),
    }))
  })

  it('waits for the last solo confirmation before entering a harvest', () => {
    const session = createWorkSession({ options: { playerCount: 1 }, configure(state) {
      state.round = 4
      state.players[0]!.resources.food = 20
    } })
    sessions.push(session)
    confirmNext(session, session.takeAction(0, 'forest'))
    const last = session.takeAction(0, 'clay-pit')
    expect(last.ok, last.error).toBe(true)
    expect(last.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(last.state.round).toBe(4)
    expect(last.state.events.some(event => event.type === 'harvest.started')).toBe(false)

    const harvested = confirmNext(session, last)
    expect(harvested.ok, harvested.error).toBe(true)
    expect(harvested.state.round).toBe(5)
    expect(harvested.state.players[0]!.resources).toMatchObject({ food: 14, begging: 0 })
    expect(harvested.state.events.filter(event => event.type === 'harvest.started')).toHaveLength(1)
  })

  it('continues switching actual players in a two-player game', () => {
    const session = createWorkSession()
    sessions.push(session)
    const first = confirmNext(session, session.takeAction(0, 'forest'))
    expect(first.state.currentPlayerIndex).toBe(1)
    assertRejectedUnchanged(session, () => session.takeAction(0, 'clay-pit'))
    const second = confirmNext(session, session.takeAction(1, 'day-laborer'))
    expect(second.state.currentPlayerIndex).toBe(0)
    expect(second.state.round).toBe(1)
  })
})

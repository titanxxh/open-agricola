import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession } from '../game/authoritative-session'
import { createOpeningSession, createWorkSession } from './_helpers/session-fixtures'
import { createDefaultRoomTiles } from '../../shared/domain/farm'
import { setActiveWorkerCount } from '../../shared/domain/player'
import { computeHarvestFeedingRequirement } from '../../shared/actions/helpers/harvest-feeding-requirement'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

describe('solo feeding with Seasons and Farmers of the Moor', () => {
  it.each([
    { playerCount: 1, summer: false, toy: false, paid: 7, food: 13 },
    { playerCount: 1, summer: false, toy: true, paid: 8, food: 12 },
    { playerCount: 1, summer: true, toy: false, paid: 7, food: 13 },
    { playerCount: 1, summer: true, toy: true, paid: 8, food: 12 },
    { playerCount: 2, summer: false, toy: true, paid: 6, food: 14 },
    { playerCount: 2, summer: true, toy: true, paid: 6, food: 14 },
  ])('feeds $paid food at $playerCount players with summer=$summer and Toy=$toy', ({ playerCount, summer, toy, paid, food }) => {
    // Round four is summer when starting in autumn, or spring when starting in summer.
    const seed = summer ? 3 : 1
    const options = { playerCount, enableThroughTheSeasons: true, enableFarmersOfTheMoor: true, deckIds: ['A'] }
    const opening = createOpeningSession({ seed, options,
      expected: { phase: 'playing', roundPhase: 'work', interaction: { stateId: 'idle' } },
    })
    sessions.push(opening)
    expect(opening.state.throughTheSeasons?.currentSeason).toBe(summer ? 'autumn' : 'summer')
    const preparedSupply = structuredClone(opening.state.farmersOfTheMoor)
    const session = createWorkSession({ seed, options, configure(state) {
      state.round = 4
      state.farmersOfTheMoor = preparedSupply
      assert.ok(state.throughTheSeasons)
      state.throughTheSeasons.currentSeason = summer ? 'summer' : 'spring'
      const owner = state.players[0]!
      owner.rooms = 3
      owner.roomTiles = createDefaultRoomTiles(3)
      owner.farmTerrain = owner.farmTerrain?.filter(tile => !owner.roomTiles.some(room => room.row === tile.row && room.col === tile.col))
      setActiveWorkerCount(owner, 3)
      owner.workers[2]!.isNewborn = true
      if (toy) owner.minorPlayed = ['E030_ChildsToy']
      for (const [index, player] of state.players.entries()) {
        player.resources = {
          food: 20, fuel: 3, horse: 0, wood: 0, clay: 0, reed: 0, stone: 0,
          grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
        }
        for (const [workerIndex, id] of (index === 0 ? ['forest', 'clay-pit'] : ['reed-bank', 'fishing']).entries()) {
          state.actionSpaces.find(space => space.id === id)!.takenBy.push({ playerId: player.id, workerId: player.workers[workerIndex]!.id })
        }
      }
    } })
    sessions.push(session)
    const scores = session.getState().scores
    expect(session.withCtx(() => computeHarvestFeedingRequirement(session.state, session.state.players[0]!))).toBe(paid)
    let response = session.performRoundEnd()
    let heatingCount = 0
    for (let step = 0; step < 12 && response.state.round === 4 && response.interaction.stateId === 'wait'; step++) {
      const request = response.interaction.request
      if (request.kind === 'heating') {
        expect(summer).toBe(false)
        expect(request.required).toBe(response.interaction.playerIndex === 0 ? 3 : 2)
        heatingCount++
        response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { fuelUsed: request.required, woodToFuel: 0 })
      } else if (request.kind === 'confirm-player-switch') {
        response = session.resolveChoice(request.fromPlayerIndex, 'confirm')
      } else if (request.kind === 'feed') {
        response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
      } else throw new Error(`Unexpected harvest request: ${request.kind}`)
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(5)
    if (response.interaction.stateId === 'wait') {
      const request = response.interaction.request
      expect(request.kind).toBe('choice')
      expect('moorSolo' in request ? request.moorSolo : null).toMatchObject({ window: 'preparation' })
    }
    expect(heatingCount).toBe(summer ? 0 : playerCount)
    expect(response.state.players[0]!.resources).toMatchObject({ food, fuel: summer ? 3 : 0, begging: 0 })
    expect(response.state.players[0]!.sickWorkerIds ?? []).toEqual([])
    if (playerCount === 2) expect(response.state.players[1]!.resources).toMatchObject({ food: 16, fuel: summer ? 3 : 1 })
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.actorPlayerId === 'p1' && event.paymentFor === 'feeding'))
      .toEqual([expect.objectContaining({ resources: { food: paid } })])
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.harvestFeedDetail', params: expect.objectContaining({ resources: { food: paid } }),
    }))
    expect(response.state.log).toContainEqual(expect.objectContaining({ key: summer ? 'log.harvestHeatingWaived' : 'log.harvestHeatingDetail' }))
    expect(response.state.throughTheSeasons?.currentSeason).toBe(summer ? 'autumn' : 'summer')
    expect(response.scores).toEqual(scores)
  })
})

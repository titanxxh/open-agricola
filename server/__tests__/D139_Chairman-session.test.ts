import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

import '../../shared/cards/D/D139_Chairman'
import assert from 'node:assert/strict'
import * as audit53Cards from './_helpers/audit/ae-negative-53-cards'

describe('D139_Chairman session', () => {
  const setup = (currentPlayerIndex: number) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = currentPlayerIndex

    const owner = state.players[0]!
    owner.occupationPlayed.push('D139_Chairman')

    session.loadState(state)
    return session
  }

  it('both players gain 1 food when opponent uses meeting-place', () => {
    const session = setup(1)
    const s = session.getState().state
    const ownerFoodBefore = s.players[0]!.resources.food
    const opponentFoodBefore = s.players[1]!.resources.food

    // Opponent (p1) uses meeting-place
    let resp = session.takeAction(1, 'meeting-place')
    expect(resp.ok).toBe(true)

    // Before-hooks with opponent scope create a PlayerSwitch to owner context
    // Walk through any pending player switches
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.food).toBe(ownerFoodBefore + 1)
    expect(after.players[1]!.resources.food).toBe(opponentFoodBefore + 1)
  })

  it('owner gains 1 food when using meeting-place themselves', () => {
    const session = setup(0)
    const foodBefore = session.getState().state.players[0]!.resources.food

    // Owner (p0) uses meeting-place
    let resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)

    // Walk through any pending player switches
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    expect(session.getState().state.players[0]!.resources.food).toBe(foodBefore + 1)
  })
})

describe('D139 Chairman parity', () => {
  const CARD_ID = 'D139_Chairman'

  const FILLER = '__test_placeholder__'

  const setup = ({ played = true, actorIndex = 0 } = {}) => {
    const session = new GameSession(6139, undefined, { playerCount: 3 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = actorIndex
    state.round = 5
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => {
      space.takenBy = []
    })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      player.resources = {
        ...player.resources,
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    session.loadState(state)
    return session
  }

  it('D139 S4: using a non-Meeting-Place action grants no Chairman food', () => {
    const response = setup().takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 1 })
  })
})

describe('ae-negative-53-cards', () => {
  const { sessions, save, ok, make, finish, ready, choose, resources } = audit53Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D139 N1 owner receives one food before minor payment while actual opponent Meeting Place rewards only actor and owner', () => { const s = make('D139_Chairman', st => { st.players[0]!.minorHand = ['A050_MilkJug']; st.players[0]!.resources.clay = 1 }), p = ok(s.takeAction(0, 'meeting-place')); resources(p, { food: 101, clay: 1 }); const r = finish(s, choose(s, p, 'actions.improvement.name')); assert.ok(r.state.players[0]!.minorPlayed.includes('A050_MilkJug')); const c = make('D139_Chairman'); finish(c, ok(c.takeAction(0, 'grain-seeds')), false); ready(c); const cr = finish(c, ok(c.takeAction(1, 'meeting-place')), false); resources(cr, { food: 101 }); resources(cr, { food: 101 }, 1); resources(cr, { food: 100 }, 2); save('D139-N1', { p, r, cr }) })
  it('D139 N2 nonmatching actions and hand-only Chairman cannot grant its food', () => { const s = make('D139_Chairman'); finish(s, ok(s.takeAction(0, 'grain-seeds')), false); ready(s); const r = finish(s, ok(s.takeAction(1, 'day-laborer')), false); resources(r, { food: 100 }); resources(r, { food: 102 }, 1); const c = make('D139_Chairman', undefined, false), cr = finish(c, ok(c.takeAction(0, 'meeting-place')), false); resources(cr, { food: 100 }); save('D139-N2', { r, cr }) })
})

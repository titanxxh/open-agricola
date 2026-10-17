import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B142_Greengrocer'
import assert from 'node:assert/strict'
import * as audit29Resources from './_helpers/audit/ae-negative-29-resources'

const CARD_ID = 'B142_Greengrocer'

const setup = (inHand = false, activePlayerIndex = 0) => {
  const session = new GameSession(142, undefined, { playerCount: 3 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = activePlayerIndex
  state.round = 14
  state.players.forEach((player) => setWorkersAtHome(state, player, 2))
  const owner = state.players[0]!
  owner.occupationHand = inHand ? [CARD_ID] : ['__test_placeholder__']
  owner.occupationPlayed = inHand ? [] : [CARD_ID]
  state.players.forEach((player) => {
    player.resources.grain = 0
    player.resources.vegetable = 0
  })
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait') {
    const option = response.interaction.request.options?.find((entry) => entry.value === CARD_ID)
    if (option) response = session.resolveChoice(0, option.value)
  }
  return response
}

describe('B142 Greengrocer parity', () => {
  it('B142 S1: playing Greengrocer through Lessons keeps the occupation in play', () => {
    const response = playOccupation(setup(true))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('B142 S2: Grain Seeds grants one grain and one vegetable', () => {
    const response = setup().takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1 })
  })

  it('B142 S3: a non-Grain-Seeds action grants no vegetable', () => {
    const response = setup().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('B142 S4: an opponent using Grain Seeds grants the owner no vegetable', () => {
    const response = setup(false, 1).takeAction(1, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
    expect(response.state.players[1]!.resources).toMatchObject({ grain: 1, vegetable: 0 })
  })
})

describe('ae-negative-29-resources', () => {
  const { sessions, save, make, action, lesson } = audit29Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('B142 N1 actual purchase and Grain Seeds grant exactly one grain and one vegetable', () => { const bought = lesson(make('B142_Greengrocer', false), 'B142_Greengrocer'); assert.equal(bought.state.players[0]!.resources.vegetable, 0); const s = make('B142_Greengrocer'), r = action(s, 0, 'grain-seeds'); assert.deepEqual([r.state.players[0]!.resources.grain, r.state.players[0]!.resources.vegetable], [1, 1]); save('B142-N1', { bought, r }); });
  it('B142 N2 an actual opponent Grain Seeds held card and unrelated action give the owner no vegetable', () => { const s = make('B142_Greengrocer'), first = action(s, 0, 'reed-bank'), r = action(s, 1, 'grain-seeds'); assert.equal(r.state.players[0]!.resources.vegetable, 0); assert.equal(r.state.players[1]!.resources.vegetable, 0); const t = make('B142_Greengrocer', false), hand = action(t, 0, 'grain-seeds'); assert.deepEqual([hand.state.players[0]!.resources.grain, hand.state.players[0]!.resources.vegetable], [1, 0]); save('B142-N2', { first, r, hand }); });
})

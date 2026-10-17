import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A105_BarrowPusher'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit12ResourceSource from './_helpers/audit/ae-negative-12-resource-source'

const CARD_ID = 'A105_BarrowPusher'

const setup = (inHand = false) => {
  const session = new GameSession(105, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = inHand ? [CARD_ID] : ['__test_placeholder__']
  player.occupationPlayed = inHand ? [] : [CARD_ID]
  player.resources.clay = 0
  player.resources.food = 0
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((entry) => entry.value === CARD_ID)
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const openFarmland = (session: GameSession) => {
  const response = session.takeAction(0, 'farmland')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected farm selection')
  expect(response.interaction.request.kind).toBe('farm-select')
  return response
}

describe('A105 Barrow Pusher parity', () => {
  it('A105 S1: playing Barrow Pusher through Lessons keeps the occupation in play', () => {
    const response = playOccupation(setup(true))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A105 S2: a legal new field grants one clay and one food', () => {
    const session = setup()
    const prompt = openFarmland(session)
    const tile = prompt.interaction.stateId === 'wait'
      ? prompt.interaction.request.farm.selectableTiles[0]
      : undefined
    expect(tile).toBeDefined()

    const response = session.commitSelectionChoice(0, { tile })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toContainEqual(expect.objectContaining(tile!))
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 1, food: 1 })
  })

  it('A105 S3: an occupied field target is rejected without Barrow Pusher resources', () => {
    const session = setup()
    openFarmland(session)
    const room = session.state.players[0]!.roomTiles[0]!

    const response = session.commitSelectionChoice(0, { tile: room })

    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.fields).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 0 })
  })

  it('A105 S4: a non-plow action does not trigger Barrow Pusher', () => {
    const session = setup()

    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 2 })
  })
})

describe('ae-negative-12-resource-source', () => {
  const { BARROW, sessions, save, ok, setup, turn, plowTriggers } = audit12ResourceSource
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('A105 N1 genuine one new field grants one clay and one food', () => {
    const session = setup(BARROW); const pending = turn(session, 0, 'farmland'); assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'farm-select')
    const response = ok(session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } })); assert.equal(response.state.players[0]!.fields.length, 1); assert.equal(response.state.players[0]!.resources.clay, 1); assert.equal(response.state.players[0]!.resources.food, 41); save('A105-N1', response)
  })
  it('A105 N2 room outside farm wrong actor and duplicate target reject before legal plow', () => {
    const session = setup(BARROW); turn(session, 0, 'farmland')
    for (const tile of [{ row: 1, col: 0 }, { row: 99, col: 99 }]) assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { tile }))
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(1, { tile: { row: 0, col: 1 } }))
    const response = ok(session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } })); assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } })); assert.equal(response.state.players[0]!.resources.clay, 1); save('A105-N2', response)
  })
  it('A105 N3 nonplow opponent and unplayed plow do not grant owner reward', () => {
    const ordinary = turn(setup(BARROW), 0, 'day-laborer'); assert.equal(ordinary.state.players[0]!.resources.clay, 0); assert.equal(ordinary.state.players[0]!.resources.food, 42)
    const session = setup(BARROW); turn(session, 0, 'grain-seeds'); turn(session, 1, 'farmland'); const response = ok(session.commitSelectionChoice(1, { tile: { row: 0, col: 1 } })); assert.equal(response.state.players[0]!.resources.clay, 0); assert.equal(response.state.players[1]!.resources.clay, 0)
    const unplayed = setup(BARROW, undefined, false); turn(unplayed, 0, 'farmland'); const result = ok(unplayed.commitSelectionChoice(0, { tile: { row: 0, col: 1 } })); assert.equal(result.state.players[0]!.resources.clay, 0); save('A105-N3', { response, result })
  })
  it('A105 N4 three real Wheel Plow fields each award clay and food and undo restores all', () => {
    for (const first of [BARROW, 'A018_WheelPlow']) {
      const session = setup(BARROW, state => state.players[0]!.minorPlayed = ['A018_WheelPlow'])
      let response = turn(session, 0, 'farmland')
      for (let n = 0; n < 3; n++) {
        response = plowTriggers(session, response, first)
        assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select', JSON.stringify(response.interaction))
        response = ok(session.commitSelectionChoice(0, { tile: { row: 0, col: n + 1 } }))
      }
      response = plowTriggers(session, response, first)
      assert.equal(response.state.players[0]!.fields.length, 3); assert.equal(response.state.players[0]!.resources.clay, 3); assert.equal(response.state.players[0]!.resources.food, 43)
      const undone = ok(session.undoAction()); assert.equal(undone.state.players[0]!.fields.length, 0); assert.equal(undone.state.players[0]!.resources.clay, 0); assert.equal(undone.state.players[0]!.resources.food, 40); save(`A105-N4-${first}`, { response, undone })
    }
  })
})

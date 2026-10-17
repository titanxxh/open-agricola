import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import { assertEmptyAccumulationRejected, confirmNext } from './_helpers/negative-rule-audit'
import * as audit13Collect from './_helpers/audit/ae-negative-13-collect'

describe('ae-negative-13-collect', () => {
  const { CATCH, sessions, save, ok, setup, turn } = audit13Collect
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('A107 N1 actual first and second placements read original five and four resource piles', () => {
    const session = setup(CATCH, state => {
      state.actionSpaces.find(s => s.id === 'forest')!.resources.wood = 5
      state.actionSpaces.find(s => s.id === 'clay-pit')!.resources.clay = 4
    })
    let response = turn(session, 0, 'forest'); assert.equal(response.state.players[0]!.resources.food, 41); assert.equal(response.state.players[0]!.resources.wood, 5)
    turn(session, 1, 'grain-seeds'); response = turn(session, 0, 'clay-pit'); assert.equal(response.state.players[0]!.resources.food, 42); assert.equal(response.state.players[0]!.resources.clay, 4); save('A107-N1', response)
  })
  it('A107 N2 wrong count and nonbuilding food pile do not award Catcher food', () => {
    for (const count of [0, 3, 4, 6]) {
      const s = setup(CATCH, state => state.actionSpaces.find(a => a.id === 'forest')!.resources.wood = count)
      const response = count === 0 ? assertEmptyAccumulationRejected(s, 0, 'forest') : turn(s, 0, 'forest')
      assert.equal(response.state.players[0]!.resources.food, 40); assert.equal(response.state.players[0]!.resources.wood, count); save(`A107-N2-${count}`, response)
    }
    const food = turn(setup(CATCH, state => state.actionSpaces.find(s => s.id === 'fishing')!.resources.food = 5), 0, 'fishing'); assert.equal(food.state.players[0]!.resources.food, 45); save('A107-N2-food', food)
  })
  it('A107 N3 actual opponent collection and card in hand cannot reward owner', () => {
    const config = (state: GameState) => state.actionSpaces.find(s => s.id === 'forest')!.resources.wood = 5
    const unplayed = turn(setup(CATCH, config, false), 0, 'forest'); assert.equal(unplayed.state.players[0]!.resources.food, 40)
    const session = setup(CATCH, config); turn(session, 0, 'grain-seeds'); const response = turn(session, 1, 'forest')
    assert.equal(response.state.players[0]!.resources.food, 40); assert.equal(response.state.players[1]!.resources.food, 40); assert.equal(response.state.players[1]!.resources.wood, 5); save('A107-N3', { response, unplayed })
  })
  it('A107 N4 whole action undo restores pile order and food before exactly one retry', () => {
    const session = setup(CATCH, state => state.actionSpaces.find(s => s.id === 'forest')!.resources.wood = 5)
    const response = turn(session, 0, 'forest'); assert.equal(response.state.players[0]!.resources.food, 41)
    const undone = ok(session.undoAction()); assert.equal(undone.state.players[0]!.resources.food, 40); assert.equal(undone.state.players[0]!.resources.wood, 0); assert.equal(undone.state.actionSpaces.find(s => s.id === 'forest')!.resources.wood, 5)
    const retry = turn(session, 0, 'forest'); assert.equal(retry.state.players[0]!.resources.food, 41); save('A107-N4', { response, undone, retry })
  })
  it('A107 N5 third person after actual growth uses three building resources once', () => {
    const session = setup(CATCH, state => {
      state.round = 7
      state.players[0]!.roomTiles.push({ row: 0, col: 0 }); state.players[0]!.rooms = 3
      state.actionSpaces.find(s => s.id === 'forest')!.resources.wood = 0
    })
    let response = turn(session, 0, 'wish-children')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const skip = response.interaction.request.options.find(o => o.value === '__skip__'); assert.ok(skip); response = ok(session.resolveChoice(0, skip.value))
    }
    assert.equal(response.state.players[0]!.workers.filter(w => w.isActive).length, 3)
    turn(session, 1, 'reed-bank'); turn(session, 0, 'day-laborer')
    response = confirmNext(session, turn(session, 1, 'clay-pit'))
    for (let n = 0; n < 15 && response.interaction.stateId === 'wait'; n++) {
      const interaction = response.interaction
      if (interaction.request.kind === 'feed') response = ok(session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] }))
      else if (interaction.request.kind === 'confirm-player-switch') response = ok(session.resolveChoice(interaction.request.toPlayerIndex, 'confirm'))
      else assert.fail(JSON.stringify(interaction))
    }
    assert.equal(response.state.round, 8); const before = response.state.players[0]!.resources.food
    turn(session, 0, 'grain-seeds'); turn(session, 1, 'reed-bank'); turn(session, 0, 'day-laborer'); turn(session, 1, 'clay-pit')
    response = turn(session, 0, 'forest'); assert.equal(response.state.players[0]!.resources.wood, 3); assert.equal(response.state.players[0]!.resources.food, before + 3); save('A107-N5', response)
  })
})

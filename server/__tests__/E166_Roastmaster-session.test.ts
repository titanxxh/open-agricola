import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertEmptyAccumulationRejected } from './_helpers/negative-rule-audit'
import * as audit58Livestock from './_helpers/audit/ae-negative-58-livestock'

describe('ae-negative-58-livestock', () => {
  const { sessions, ok, save, make, finish, count } = audit58Livestock
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('E166 N1 Fishing and Traveling Players each move exactly one food to the other original space before collection and gain one cattle', () => {
    for (const space of ['fishing', 'traveling-players']) {
      const other = space === 'fishing' ? 'traveling-players' : 'fishing'
      const session = make('E166_Roastmaster', state => { state.players[0]!.resources.food = 0; state.actionSpaces.find(candidate => candidate.id === space)!.resources.food = 3; state.actionSpaces.find(candidate => candidate.id === other)!.resources.food = 2 })
      const response = finish(session, ok(session.takeAction(0, space)), true)
      assert.equal(response.state.players[0]!.resources.food, 2)
      assert.deepEqual(count(response), [0, 0, 1])
      assert.equal(response.state.actionSpaces.find(candidate => candidate.id === space)!.resources.food, 0)
      assert.equal(response.state.actionSpaces.find(candidate => candidate.id === other)!.resources.food, 3)
      save(`E166-N1-${space}`, response)
    }
  })
  it('E166 N2 optional decline and card only in hand preserve the full Fishing pile and grant no cattle', () => {
    for (const played of [true, false]) {
      const session = make('E166_Roastmaster', state => { state.players[0]!.resources.food = 0; state.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 3; state.actionSpaces.find(space => space.id === 'traveling-players')!.resources.food = 2 }, played)
      if (!played) assert.ok(session.getState().state.players[0]!.occupationHand.includes('E166_Roastmaster'))
      const response = finish(session, ok(session.takeAction(0, 'fishing')), !played)
      assert.equal(response.state.players[0]!.resources.food, 3)
      assert.deepEqual(count(response), [0, 0, 0])
      assert.equal(response.state.actionSpaces.find(space => space.id === 'traveling-players')!.resources.food, 2)
      save(`E166-N2-${played}`, response)
    }
  })
  it('E166 N3 empty source cannot move food or gain cattle and unrelated owner or opponent action cannot trigger', () => {
    const empty = make('E166_Roastmaster', state => { state.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 0 })
    const emptyResponse = assertEmptyAccumulationRejected(empty, 0, 'fishing')
    assert.deepEqual(count(emptyResponse), [0, 0, 0])
    for (const actor of [0, 1]) {
      const session = make('E166_Roastmaster', state => { state.currentPlayerIndex = actor })
      const response = finish(session, ok(session.takeAction(actor, actor === 0 ? 'grain-seeds' : 'fishing')), true)
      assert.deepEqual(count(response), [0, 0, 0])
      save(`E166-N3-${actor}`, response)
    }
    save('E166-N3-empty', emptyResponse)
  })
  it('E166 N4 whole Fishing undo restores both food piles cattle and worker before one accepted replay', () => {
    const session = make('E166_Roastmaster', state => { state.players[0]!.resources.food = 0; state.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 2; state.actionSpaces.find(space => space.id === 'traveling-players')!.resources.food = 1 })
    const response = finish(session, ok(session.takeAction(0, 'fishing')), true)
    const undone = ok(session.undoAction())
    assert.equal(undone.state.players[0]!.resources.food, 0)
    assert.deepEqual(count(undone), [0, 0, 0])
    assert.equal(undone.state.actionSpaces.find(space => space.id === 'fishing')!.resources.food, 2)
    assert.equal(undone.state.actionSpaces.find(space => space.id === 'traveling-players')!.resources.food, 1)
    assert.equal(undone.state.actionSpaces.find(space => space.id === 'fishing')!.takenBy.length, 0)
    const replay = finish(session, ok(session.takeAction(0, 'fishing')), true)
    assert.equal(replay.state.players[0]!.resources.food, 1)
    assert.deepEqual(count(replay), [0, 0, 1])
    save('E166-N4', { response, undone, replay })
  })
})

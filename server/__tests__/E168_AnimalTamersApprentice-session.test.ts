import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit58Livestock from './_helpers/audit/ae-negative-58-livestock'

describe('ae-negative-58-livestock', () => {
  const { sessions, animals, ok, save, make, pasture, finish, transition, play, count } = audit58Livestock
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('E168 N1 real natural round start grants one sheep boar or cattle per unoccupied wood clay or stone room', () => {
    for (const [house, animal] of [['wood', 'sheep'], ['clay', 'boar'], ['stone', 'cattle']] as const) {
      const session = make('E168_AnimalTamersApprentice', state => { const owner = state.players[0]!; owner.houseType = house; owner.rooms = 4; owner.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }]; pasture(owner) })
      const response = transition(session, 6)
      assert.equal(response.state.players[0]!.resources[animal], 2)
      assert.deepEqual(count(response), animals.map(candidate => candidate === animal ? 2 : 0))
      assert.deepEqual(response.state.players.slice(1).map(player => player.resources[animal]), [0, 0, 0])
      save(`E168-N1-${house}`, response)
    }
  })
  it('E168 N2 no unoccupied rooms and a house pet cannot add offspring while real next round begins', () => {
    for (const pet of [false, true]) {
      const session = make('E168_AnimalTamersApprentice', state => { if (pet) { state.players[0]!.resources.sheep = 1; state.players[0]!.houseAnimals = { '1-0': 'sheep' } } })
      const response = transition(session, 6)
      assert.deepEqual(count(response), [pet ? 1 : 0, 0, 0])
      save(`E168-N2-${pet}`, response)
    }
  })
  it('E168 N3 card only in hand and midround empty room cannot grant round start animals early', () => {
    for (const played of [true, false]) {
      const session = make('E168_AnimalTamersApprentice', state => { state.players[0]!.rooms = 3; state.players[0]!.roomTiles.push({ row: 1, col: 1 }) }, played)
      const before = finish(session, ok(session.takeAction(0, 'grain-seeds')))
      assert.deepEqual(count(before), [0, 0, 0])
      const response = transition(session, 6)
      assert.deepEqual(count(response), [played ? 1 : 0, 0, 0])
      save(`E168-N3-${played}`, { before, response })
    }
  })
  it('E168 N4 real Lodger purchase provides housing for one person and next round rewards one physically unoccupied room', () => {
    const session = make('E168_AnimalTamersApprentice', state => { state.players[0]!.occupationHand = ['A127_Lodger', 'A110_Roughcaster'] })
    const played = finish(session, play(session, 'A127_Lodger'))
    assert.equal(played.state.players[0]!.rooms, 2)
    assert.equal(played.state.players[0]!.roomTiles.length, 2)
    assert.equal(played.state.players[0]!.cardStates.A127_Lodger?.extraData?.hasRoom, true)
    assert.deepEqual(count(played), [0, 0, 0])
    const response = transition(session, 6)
    assert.deepEqual(count(response), [1, 0, 0])
    assert.equal(response.state.players[0]!.rooms, 2)
    assert.equal(response.state.players[0]!.roomTiles.length, 2)
    save('E168-N4', { played, response })
  })
})

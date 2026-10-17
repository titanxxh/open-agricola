import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit57Resources from './_helpers/audit/ae-negative-57-resources'

describe('ae-negative-57-resources', () => {
  const { sessions, ok, save, make, finish, play, buildings, exchange } = audit57Resources
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('D162 N1 real occupation purchase gains exactly two clay and undo removes the immediate reward before one replay', () => {
    const session = make('D162_ClayFirer', undefined, false), response = finish(session, play(session, 'D162_ClayFirer')), undone = ok(session.undoAction()), replay = finish(session, play(session, 'D162_ClayFirer'))
    assert.deepEqual(buildings(response), { wood: 0, clay: 2, reed: 0, stone: 0 })
    assert.deepEqual(buildings(undone), { wood: 0, clay: 0, reed: 0, stone: 0 })
    assert.ok(undone.state.players[0]!.occupationHand.includes('D162_ClayFirer'))
    assert.deepEqual(buildings(replay), { wood: 0, clay: 2, reed: 0, stone: 0 })
    save('D162-N1', { response, undone, replay })
  })
  it('D162 N2 public anytime two or three clay exchange pays exactly and gains one or two stone without spending a worker', () => {
    for (const clay of [2, 3]) {
      const session = make('D162_ClayFirer', state => { state.players[0]!.resources.clay = clay }), workers = JSON.stringify(session.state.players[0]!.workers), result = exchange(session, clay)
      assert.deepEqual(buildings(result.response), { wood: 0, clay: 0, reed: 0, stone: clay === 2 ? 1 : 2 })
      assert.equal(JSON.stringify(result.response.state.players[0]!.workers), workers)
      save(`D162-N2-${clay}`, result)
    }
  })
  it('D162 N3 unrelated Grain Seeds preserves one clay or a hand-only three clay without producing stone', () => {
    for (const [played, clay] of [[true, 1], [false, 3]] as const) {
      const session = make('D162_ClayFirer', state => { state.players[0]!.resources.clay = clay }, played)
      const response = finish(session, ok(session.takeAction(0, 'grain-seeds')))
      assert.deepEqual(buildings(response), { wood: 0, clay, reed: 0, stone: 0 })
      assert.equal(response.state.players[0]!.resources.grain, 1)
      save(`D162-N3-${played}`, response)
    }
  })
})

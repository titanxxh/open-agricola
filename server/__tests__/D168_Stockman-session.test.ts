import { describe, it, afterEach } from 'vitest'

import '../../shared/cards/D/D168_Stockman'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit58Livestock from './_helpers/audit/ae-negative-58-livestock'


describe('ae-negative-58-livestock', () => {
  const { sessions, ok, save, make, finish, play, choose, count, buildStables } = audit58Livestock
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('D168 N1 building second third and fourth stables in one paid batch grants exactly cattle boar and sheep', () => {
    const session = make('D168_Stockman', state => { state.players[0]!.stableTiles = [{ row: 0, col: 1 }]; state.players[0]!.resources.wood = 6 })
    const response = buildStables(session, [{ row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 }])
    assert.deepEqual(count(response), [1, 1, 1])
    assert.equal(response.state.players[0]!.stableTiles.length, 4)
    assert.equal(response.state.players[0]!.resources.wood, 0)
    save('D168-N1', response)
  })
  it('D168 N2 first stable and card only in hand grant no animals while ordinary two wood stable fee is paid', () => {
    for (const [played, prior] of [[true, 0], [false, 1]] as const) {
      const session = make('D168_Stockman', state => { state.players[0]!.stableTiles = prior ? [{ row: 0, col: 1 }] : []; state.players[0]!.resources.wood = 2 }, played)
      const response = buildStables(session, [{ row: 0, col: 2 }])
      assert.deepEqual(count(response), [0, 0, 0])
      assert.equal(response.state.players[0]!.stableTiles.length, prior + 1)
      assert.equal(response.state.players[0]!.resources.wood, 0)
      save(`D168-N2-${played}`, response)
    }
  })
  it('D168 N3 actual occupation purchase with four preexisting stables grants no retroactive animals', () => {
    const session = make('D168_Stockman', state => { state.players[0]!.stableTiles = [1, 2, 3, 4].map(col => ({ row: 0, col })) }, false)
    const response = finish(session, play(session, 'D168_Stockman'))
    assert.deepEqual(count(response), [0, 0, 0])
    assert.equal(response.state.players[0]!.stableTiles.length, 4)
    save('D168-N3', response)
  })
  it('D168 N4 occupied stable target rejects before legal second stable and whole undo removes cattle and restores wood', () => {
    const session = make('D168_Stockman', state => { state.players[0]!.stableTiles = [{ row: 0, col: 1 }]; state.players[0]!.resources.wood = 2 })
    let pending = ok(session.takeAction(0, 'farm-expansion'))
    if (pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice') pending = choose(session, pending, option => option.labelKey === 'actions.stables.name')
    const rejected = assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] }))
    const response = finish(session, ok(session.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })))
    const undone = ok(session.undoAction())
    assert.deepEqual(count(response), [0, 0, 1])
    assert.deepEqual(count(undone), [0, 0, 0])
    assert.equal(undone.state.players[0]!.resources.wood, 2)
    assert.equal(undone.state.players[0]!.stableTiles.length, 1)
    save('D168-N4', { pending, rejected, response, undone })
  })
})

import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit12Scoring from './_helpers/audit/ae-negative-12-scoring'

describe('ae-negative-12-scoring', () => {
  const { ARCH, sessions, save, ok, setup, bonus, pasture, choices } = audit12Scoring
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('A098 N1 zero through four own unfenced stables score one each on repeated reads', () => {
    for (const count of [0, 1, 2, 3, 4]) {
      const session = setup(ARCH, state => state.players[0]!.stableTiles = Array.from({ length: count }, (_, col) => ({ row: 0, col: col + 1 })))
      const response = session.getState(); assert.equal(bonus(response, ARCH), count)
      assert.equal(bonus(session.getState(), ARCH), count); save(`A098-N1-${count}`, response)
    }
  })
  it('A098 N2 fenced stable is excluded while another unfenced stable counts', () => {
    const session = setup(ARCH, state => { state.players[0]!.stableTiles = [{ row: 0, col: 1 }, { row: 0, col: 2 }]; pasture(state, [{ row: 0, col: 1 }]) })
    const response = session.getState(); assert.equal(bonus(response, ARCH), 1); save('A098-N2', response)
  })
  it('A098 N3 card in hand and opponent ownership cannot score owner stables', () => {
    const configure = (state: GameState) => { state.players[0]!.stableTiles = [{ row: 0, col: 1 }]; state.players[1]!.stableTiles = [{ row: 0, col: 1 }, { row: 0, col: 2 }] }
    assert.equal(bonus(setup(ARCH, configure, false).getState(), ARCH), 0)
    const response = setup(ARCH, configure, true, 1).getState(); assert.equal(bonus(response, ARCH), 0); assert.equal(bonus(response, ARCH, 1), 2); save('A098-N3', response)
  })
  it('A098 N4 real stable construction changes score and invalid target preserves pending', () => {
    const session = setup(ARCH); let response = ok(session.takeAction(0, 'farm-expansion'))
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const option = choices(response).find(option => option.labelKey === 'actions.stables.name'); assert.ok(option)
      response = ok(session.resolveChoice(0, option.value))
    }
    assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select')
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { stables: [{ row: 1, col: 0 }] }))
    response = ok(session.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] }))
    assert.equal(response.state.players[0]!.stableTiles.length, 1); assert.equal(response.state.players[0]!.resources.wood, 13); assert.equal(bonus(response, ARCH), 1)
    save('A098-N4', response)
  })
  it('A098 N5 real fencing stops stable bonus and public undo restores it before retry', () => {
    const session = setup(ARCH, state => state.players[0]!.stableTiles = [{ row: 0, col: 1 }])
    const before = session.getState(); assert.equal(bonus(before, ARCH), 1)
    const edges = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']
    function fence() { ok(session.takeAction(0, 'fencing')); return ok(session.commitSelectionChoice(0, { edges })) }
    const response = fence(); assert.equal(bonus(response, ARCH), 0); assert.equal(response.state.players[0]!.resources.wood, 11)
    const undone = ok(session.undoAction()); assert.equal(bonus(undone, ARCH), 1); assert.deepEqual(undone.state.players[0]!.stableTiles, before.state.players[0]!.stableTiles); assert.equal(undone.state.players[0]!.fenceSegments.length, 0); assert.equal(undone.state.players[0]!.resources.wood, 15)
    assert.equal(bonus(fence(), ARCH), 0); save('A098-N5', { response, undone })
  })
})

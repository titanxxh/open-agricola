import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit13Minor from './_helpers/audit/ae-negative-13-minor'

describe('ae-negative-13-minor', () => {
  const { STABLE, sessions, save, ok, setup, enterMinor, buy } = audit13Minor
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('C002 N1 real paid passing card builds exactly one free stable', () => {
    const session = setup(STABLE, 1); const pending = buy(session, STABLE); assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'farm-select')
    const r = ok(session.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] })); assert.equal(r.state.players[0]!.resources.wood, 0); assert.deepEqual(r.state.players[0]!.stableTiles, [{ row: 0, col: 1 }]); assert(r.state.players[1]!.minorHand.includes(STABLE)); save('C002-N1', r)
  })
  it('C002 N2 mandatory single stable rejects cancel multiple targets bad tiles and wrong actor then retries', () => {
    const session = setup(STABLE, 1); buy(session, STABLE)
    for (const payload of [{ cancel: true }, { stables: [{ row: 0, col: 1 }, { row: 0, col: 2 }] }, { stables: [{ row: 1, col: 0 }] }, { stables: [{ row: 99, col: 99 }] }]) assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, payload))
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(1, { stables: [{ row: 0, col: 1 }] }))
    const r = ok(session.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] })); assert.equal(r.state.players[0]!.stableTiles.length, 1); assert.equal(r.state.players[0]!.resources.wood, 0); save('C002-N2', r)
  })
  it('C002 N3 zero wood cannot buy and whole undo restores stable payment and hand', () => {
    const poor = setup(STABLE, 0); enterMinor(poor); assertRejectedUnchanged(poor, () => poor.resolveChoice(0, STABLE)); assert.equal(poor.getState().state.players[0]!.stableTiles.length, 0)
    const session = setup(STABLE, 1); buy(session, STABLE); const r = ok(session.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] })); const undone = ok(session.undoAction()); assert.equal(undone.state.players[0]!.resources.wood, 1); assert.equal(undone.state.players[0]!.stableTiles.length, 0); assert(undone.state.players[0]!.minorHand.includes(STABLE)); assert(!undone.state.players[1]!.minorHand.includes(STABLE)); save('C002-N3', { r, undone })
  })
  it('C002 N4 finite four stable supply cannot produce a fifth stable', () => {
    const session = setup(STABLE, 1, state => state.players[0]!.stableTiles = [1, 2, 3, 4].map(col => ({ row: 0, col })))
    const r = enterMinor(session); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
    // No printed stable-stock prerequisite: buying is permitted; finite stock must prevent a fifth.
    const bought = ok(session.resolveChoice(0, STABLE))
    if (bought.interaction.stateId === 'wait' && bought.interaction.request.kind === 'farm-select') assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { stables: [{ row: 2, col: 1 }] }))
    assert.equal(bought.state.players[0]!.stableTiles.length, 4); assert.equal(bought.state.players[0]!.resources.wood, 0); save('C002-N4', bought)
  })
})

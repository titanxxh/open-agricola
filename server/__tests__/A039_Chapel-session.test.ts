import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit07Spaces from './_helpers/audit/ae-negative-07-spaces'

describe('ae-negative-07-spaces', () => {
  const { A039, occupations, sessions, setup, ready, turn, buy, denied, bonus, chapelUndo, occupants } = audit07Spaces
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A039 N1 fee or occupation shortage rejects forged card before exact-cost public space', () => {
    for (const config of [{ resources: { wood: 2, clay: 2 } }, { resources: { wood: 3, clay: 1 } }, { resources: { wood: 3, clay: 2 }, occ: occupations.slice(0, 1) }]) denied(setup({ played: false, ...config }), A039)
    const r = buy(setup({ played: false, resources: { wood: 3, clay: 2 } }), A039); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.clay, 0); assert.equal(r.state.actionSpaces.filter(a => a.id === A039).length, 1); assert.equal(bonus(r), 0)
  })
  it('A039 N2 zero-grain owner uses Chapel free and occupied replay cannot score again', () => {
    const s = setup(); const r = turn(s, 0, A039); assert.equal(bonus(r), 3); assert.equal(r.state.players[0]!.resources.grain, 0); assert.equal(occupants(r), 1)
    assertRejectedUnchanged(s, () => s.takeAction(0, A039)); turn(s, 1, 'forest'); ready(s, 0); assertRejectedUnchanged(s, () => s.takeAction(0, A039)); turn(s, 0, 'grain-seeds'); assert.equal(bonus(s.getState()), 3)
  })
  it('A039 N3 guest pays one grain to owner and receives exactly three bonus points', () => {
    const s = setup({ opponent: { grain: 1 } }); turn(s, 0, 'forest'); ready(s, 1); assertRejectedUnchanged(s, () => s.takeAction(0, A039)); const r = turn(s, 1, A039)
    assert.equal(r.state.players[0]!.resources.grain, 1); assert.equal(r.state.players[1]!.resources.grain, 0); assert.equal(bonus(r), 0); assert.equal(bonus(r, 1), 3); assert.equal(occupants(r), 1); assertRejectedUnchanged(s, () => s.takeAction(1, A039))
  })
  it('A039 N4 zero-grain guest is atomically denied before legal ordinary retry', () => {
    const s = setup(); turn(s, 0, 'forest'); ready(s, 1); assertRejectedUnchanged(s, () => s.takeAction(1, A039)); const r = turn(s, 1, 'grain-seeds'); assert.equal(r.state.players[1]!.resources.grain, 1); assert.equal(bonus(r, 1), 0); assert.equal(occupants(r), 0)
  })
  it('A039 N5 undo restores owner use and guest transfer before a single replay award', () => {
    const owner = setup(); const before = undoRuleSnapshot(owner.getState()); turn(owner, 0, A039); chapelUndo(before, owner.undoAction()); assert.equal(bonus(turn(owner, 0, A039)), 3)
    const s = setup({ opponent: { grain: 1 } }); turn(s, 0, 'forest'); ready(s, 1); const guestBefore = undoRuleSnapshot(s.getState()); turn(s, 1, A039); chapelUndo(guestBefore, s.undoAction()); const r = turn(s, 1, A039); assert.equal(bonus(r, 1), 3); assert.equal(r.state.players[0]!.resources.grain, 1); assert.equal(r.state.players[1]!.resources.grain, 0)
  })
})

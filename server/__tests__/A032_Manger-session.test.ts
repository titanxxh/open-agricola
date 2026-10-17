import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit06Scoring from './_helpers/audit/ae-negative-06-scoring'

describe('ae-negative-06-scoring', () => {
  const { MANGER, sessions, ok, setup, buy, denied, bonus, pastures, manger } = audit06Scoring
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A032 N1 one wood rejects purchase and exact two wood activates only the owned pasture bonus', () => {
    denied(manger(6, { played: false, wood: 1 }), MANGER)
    const s = manger(6, { played: false, wood: 2 }); assert.equal(bonus(s.getState(), MANGER), 0); const r = buy(s, MANGER); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(bonus(r, MANGER), 1); assertRejectedUnchanged(s, () => s.resolveChoice(0, MANGER))
  })
  it('A032 N2 legal finite fence layouts cover every lower threshold and the four point upper cap', () => {
    for (const [area, expected] of [[5, 0], [6, 1], [7, 2], [8, 3], [9, 3], [10, 4], [12, 4]]) { const s = manger(area); assert.equal(bonus(s.getState(), MANGER), expected); assert.equal(bonus(s.getState(), MANGER), expected) }
  })
  it('A032 N3 two separate pastures add physical area while stable and animals change no area bonus', () => {
    const groups = [[{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 1 }], [{ row: 0, col: 3 }, { row: 1, col: 2 }, { row: 1, col: 3 }]]
    for (const stable of [false, true]) { const s = setup(MANGER, {}, state => pastures(state, groups, 0, stable, stable ? 2 : 0)); assert.equal(bonus(s.getState(), MANGER), 1) }
  })
  it('A032 N4 planted fields loose stable and the opponents large pasture do not add owner pasture area', () => {
    const s = manger(5); const other = setup(MANGER, {}, state => {
      const p = state.players[0]!; p.stableTiles = [{ row: 0, col: 1 }]; p.fields = [{ row: 1, col: 1, stacks: [{ kind: 'grain', remaining: 3 }] }]
      state.players[1]!.roomTiles = [{ row: 2, col: 0 }, { row: 2, col: 1 }]
      pastures(state, [Array.from({ length: 10 }, (_, n) => ({ row: Math.floor(n / 5), col: n % 5 }))], 1)
    }); assert.equal(bonus(s.getState(), MANGER), 0); assert.equal(bonus(other.getState(), MANGER), 0)
  })
  it('A032 N5 actual three fence enclosure crosses six spaces and full undo restores five spaces', () => {
    const s = manger(5, { wood: 3 }); const before = undoRuleSnapshot(s.getState()); assert.equal(bonus(s.getState(), MANGER), 0)
    const menu = ok(s.takeAction(0, 'fencing')); assert(menu.interaction.stateId === 'wait' && menu.interaction.request.kind === 'farm-select', JSON.stringify(menu.interaction))
    const r = ok(s.commitSelectionChoice(0, { edges: ['H-2-0', 'V-1-0', 'V-1-1'] })); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.fenceSegments.length, 15); assert.equal(bonus(r, MANGER), 1); assertUndoRestored(before, s.undoAction())
  })
})

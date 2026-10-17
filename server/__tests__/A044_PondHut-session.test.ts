import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit07Future from './_helpers/audit/ae-negative-07-future'

describe('ae-negative-07-future', () => {
  const { HUT, sessions, setup, buy, deny, rounds, complete, food, printedVp } = audit07Future
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A044 N1 exact two occupations and one wood gate real purchase', () => {
    for (const occupations of [0, 1, 3]) deny(setup(HUT, { occupations, resources: { wood: 1 } }), HUT)
    deny(setup(HUT, { resources: { wood: 0 } }), HUT)
    const r = buy(setup(HUT, { resources: { wood: 1 } }), HUT); assert.equal(r.state.players[0]!.resources.wood, 0); assert.deepEqual(rounds(r, HUT), [6, 7, 8])
  })
  it('A044 N2 purchase schedule survives stale rejection and whole purchase undo retry', () => {
    const s = setup(HUT, { resources: { wood: 1 } }); const before = undoRuleSnapshot(s.getState()); let r = buy(s, HUT)
    assert.deepEqual(rounds(r, HUT), [6, 7, 8]); assert.equal(r.state.players[0]!.resources.food, 40); assert.equal(printedVp(r, HUT), 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, HUT)); assertUndoRestored(before, s.undoAction()); r = buy(s, HUT); assert.deepEqual(rounds(r, HUT), [6, 7, 8]); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.food, 40); assert.equal(printedVp(r, HUT), 1)
  })
  it('A044 N3 natural rounds pay once to owner and exhaust three scheduled food', () => {
    const s = setup(HUT, { resources: { wood: 1 } }); buy(s, HUT)
    for (const [i, remaining] of [[7, 8], [8], [], []].entries()) { const r = complete(s, i === 0); assert.equal(r.state.round, 6 + i); assert.deepEqual(rounds(r, HUT), remaining); assert.deepEqual(food(r), [[41, 40], [42, 40], [39, 36], [39, 36]][i]) }
  })
  it('A044 N4 controlled late purchase keeps only future existing round spaces', () => {
    for (const round of [13, 14]) { const r = buy(setup(HUT, { round, resources: { wood: 1 } }), HUT); assert.deepEqual(rounds(r, HUT), round === 13 ? [14] : []); assert.equal(r.state.players[0]!.resources.food, 40); assert.equal(r.state.players[0]!.resources.wood, 0) }
  })
})

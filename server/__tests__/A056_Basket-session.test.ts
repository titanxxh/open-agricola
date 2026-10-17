import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit08Flow from './_helpers/audit/ae-negative-08-flow'

describe('ae-negative-08-flow', () => {
  const { BASKET, CULTIVATOR, MUSHROOM, sessions, ok, opts, turn, buy, deny, gainCount, resource, forest, basket, accept, source, basketFacts } = audit08Flow
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A056 N1 reed shortage rejects forged Basket before exact reed purchase', () => {
    deny(basket({ played: false }), BASKET); const r = buy(basket({ played: false, resources: { reed: 1, food: 0 } }), BASKET); assert.equal(r.state.players[0]!.resources.reed, 0); assert.ok(r.state.players[0]!.minorPlayed.includes(BASKET))
  })
  it('A056 N2 Forest three returns exactly two wood to the original space once', () => {
    const s = basket(); const offer = turn(s, 0, 'forest'); const old = opts(offer).find(o => o.value !== '__skip__'); assert.ok(old); const r = accept(s, offer); basketFacts(r, 1, 3, 2); assert.equal(forest(r).takenBy.length, 1); assertRejectedUnchanged(s, () => s.resolveChoice(0, old.value))
  })
  it('A056 N3 collected one wood may combine old wood but total one cannot exchange', () => {
    const control = basket({ stock: 1, resources: { wood: 1, food: 0 } }); basketFacts(accept(control, turn(control, 0, 'forest')), 0, 3, 2)
    const s = basket({ stock: 1 }); const r = turn(s, 0, 'forest'); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player'); basketFacts(r, 1, 0, 0); assertRejectedUnchanged(s, () => s.resolveChoice(0, '0'))
  })
  it('A056 N4 empty wood accumulation rejects without spending two existing wood', () => {
    const s = basket({ stock: 0, resources: { wood: 2, food: 0 } })
    const r = assertEmptyAccumulationRejected(s, 0, 'forest')
    basketFacts(r, 2, 0, 0)
    assert.equal(forest(r).takenBy.length, 0)
  })
  it('A056 N5 decline and actual undo restore wood before replaying a decline', () => {
    const decline = basket(); turn(decline, 0, 'forest'); basketFacts(ok(decline.resolveChoice(0, '__skip__')), 3, 0, 0)
    const s = basket(); const before = undoRuleSnapshot(s.getState()); accept(s, turn(s, 0, 'forest')); assertUndoRestored(before, s.undoAction()); turn(s, 0, 'forest'); basketFacts(ok(s.resolveChoice(0, '__skip__')), 3, 0, 0)
  })
  it('A056 N6 nonwood accumulation and real opponent Forest do not trigger holder Basket', () => {
    const non = turn(basket({ resources: { wood: 2, food: 0 } }), 0, 'clay-pit'); resource(non, 'wood', 2); resource(non, 'food', 0)
    const s = basket({ resources: { wood: 2, food: 0 }, opponent: { food: 0 } }); turn(s, 0, 'grain-seeds'); const r = turn(s, 1, 'forest'); resource(r, 'wood', 2); resource(r, 'food', 0); resource(r, 'wood', 3, 1); resource(r, 'food', 0, 1); assert.equal(forest(r).resources.wood, 0)
  })
  it('A056 N7 later Basket food cannot fund earlier Shifting Cultivator before collection', () => {
    for (const food of [0, 3]) { const s = basket({ occupations: [CULTIVATOR], resources: { food } }); let r = turn(s, 0, 'forest'); if (food === 3) { r = accept(s, r); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select'); r = ok(s.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })) } r = accept(s, r); basketFacts(r, 1, 3, 2); assert.equal(r.state.players[0]!.fields.length, food === 3 ? 1 : 0); assertRejectedUnchanged(s, () => s.resolveChoice(0, CULTIVATOR)) }
  })
  it('A056 N8 two immediately-after sources consume once and undo restores original wood', () => {
    for (const first of [BASKET, MUSHROOM]) { const s = basket({ occupations: [MUSHROOM] }); const before = undoRuleSnapshot(s.getState()); let r = turn(s, 0, 'forest'); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger'); r = source(s, r, first); assertRejectedUnchanged(s, () => s.resolveChoice(0, first)); r = source(s, r, first === BASKET ? MUSHROOM : BASKET); basketFacts(r, 0, 5, 3); assert.equal(gainCount(r, BASKET), 1); assert.equal(gainCount(r, MUSHROOM), 1); assertUndoRestored(before, s.undoAction()); basketFacts(s.getState(), 0, 0, 3) }
  })
})

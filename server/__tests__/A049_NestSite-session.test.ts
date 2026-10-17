import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, passPreparationExchanges, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit08Income from './_helpers/audit/ae-negative-08-income'

describe('ae-negative-08-income', () => {
  const { NEST, sessions, setup, buy, deny, turn, food, bank, nest, finish } = audit08Income
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A049 N1 actual Nest Site purchase requires one occupation and one food', () => {
    deny(setup(NEST, { occupations: 0 }), NEST); deny(setup(NEST, { occupations: 1, resources: { food: 0 } }), NEST)
    const r = buy(nest(), NEST); assert.ok(r.state.players[0]!.minorPlayed.includes(NEST)); assert.deepEqual(food(r), [39, 40])
  })
  it('A049 N2 natural preparation rewards untouched Reed Bank once then own collection empties it', () => {
    const s = nest(); buy(s, NEST); turn(s, 1, 'forest'); turn(s, 0, 'grain-seeds'); let r = passPreparationExchanges(s, confirmNext(s, turn(s, 1, 'clay-pit')))
    assert.equal(r.state.round, 6); assert.deepEqual([...food(r), bank(r)], [40, 40, 2])
    r = finish(s, 'meeting-place'); assert.equal(r.state.round, 7); assert.deepEqual([...food(r), bank(r)], [41, 40, 3])
    r = turn(s, 0, 'reed-bank'); assert.equal(r.state.players[0]!.resources.reed, 3); turn(s, 1, 'forest'); turn(s, 0, 'grain-seeds'); r = passPreparationExchanges(s, confirmNext(s, turn(s, 1, 'clay-pit'))); assert.equal(r.state.round, 8); assert.deepEqual([...food(r), bank(r)], [37, 36, 1])
  })
  it('A049 N3 actual opponent Reed Bank collection prevents owner food until later uncollected refill', () => {
    const s = nest(); buy(s, NEST); turn(s, 1, 'reed-bank'); turn(s, 0, 'grain-seeds'); let r = passPreparationExchanges(s, confirmNext(s, turn(s, 1, 'clay-pit'))); assert.equal(r.state.round, 6); assert.deepEqual([...food(r), bank(r)], [39, 40, 1]); assert.equal(r.state.players[1]!.resources.reed, 1)
    r = finish(s, 'meeting-place'); assert.equal(r.state.round, 7); assert.deepEqual([...food(r), bank(r)], [40, 40, 2])
  })
  it('A049 N4 not yet played Nest Site has no preparation reward and purchase undo permits one retry', () => {
    const unplayed = nest(); const r = finish(unplayed, 'day-laborer'); assert.equal(r.state.round, 6); assert.deepEqual(food(r), [42, 40]); assert.equal(bank(r), 2)
    const s = nest(); const before = undoRuleSnapshot(s.getState()); buy(s, NEST); assertRejectedUnchanged(s, () => s.resolveChoice(0, NEST)); assertUndoRestored(before, s.undoAction()); assert.equal(buy(s, NEST).state.players[0]!.resources.food, 39)
  })
})

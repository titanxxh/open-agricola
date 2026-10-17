import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { getLogicalFields } from '../../shared/cards/helpers/card-field'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit09Immediate from './_helpers/audit/ae-negative-09-immediate'

describe('ae-negative-09-immediate', () => {
  const { KNIFE, ROTATION, sessions, setup, buy, passed, deny, fields, goods } = audit09Immediate
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A007 N1 one wood payment must precede any immediate field rewards', () => {
    const s = setup(KNIFE, {}, state => fields(state.players[0]!, [['grain', 3], ['vegetable', 2]])); deny(s, KNIFE)
    assert.equal(s.getState().state.players[0]!.resources.grain, 0)
  })
  it('A007 N2 one grain and one vegetable field give their separate literal goods', () => {
    const r = buy(setup(KNIFE, { wood: 1 }, state => fields(state.players[0]!, [['grain', 3], ['vegetable', 2]])), KNIFE)
    assert.deepEqual(goods(r), { food: 41, wood: 0, clay: 0, grain: 1 }); passed(r, KNIFE)
  })
  it('A007 N3 several crop units still count distinct fields once each', () => {
    const r = buy(setup(KNIFE, { wood: 1 }, state => fields(state.players[0]!, [['grain', 3], ['grain', 2], ['grain', 1], ['vegetable', 2], ['vegetable', 1]])), KNIFE)
    assert.deepEqual(goods(r), { food: 43, wood: 0, clay: 0, grain: 2 }); passed(r, KNIFE)
  })
  it('A007 N4 empty fields provide neither grain field nor vegetable field reward', () => {
    const r = buy(setup(KNIFE, { wood: 1 }, state => fields(state.players[0]!, [[null, 0], [null, 0]])), KNIFE)
    assert.deepEqual(goods(r), { food: 40, wood: 0, clay: 0, grain: 0 }); passed(r, KNIFE)
  })
  it('A007 N5 buyer fields determine reward before left passing', () => {
    const s = setup(KNIFE, { wood: 1 }, state => { fields(state.players[0]!, [['grain', 3]]); fields(state.players[1]!, [['vegetable', 2], ['vegetable', 1]]) })
    const r = buy(s, KNIFE); assert.deepEqual(goods(r), { food: 41, wood: 0, clay: 0, grain: 0 }); assert.deepEqual(goods(r, 1), { food: 40, wood: 0, clay: 0, grain: 0 }); passed(r, KNIFE)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, KNIFE))
  })
  it('A007 N6 Card Field grain contributes one logical field if independently applicable', () => {
    const s = setup(KNIFE, { wood: 1 }, state => { const p = state.players[0]!; p.minorPlayed = [ROTATION]; p.occupationPlayed = ['A111_WallBuilder']; fields(p, [[null, 0]]); p.cardStates[ROTATION] = { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 2 }] } } })
    assert.equal(getLogicalFields(s.getState().state.players[0]!).filter(f => f.sourceCard === ROTATION).length, 1)
    const r = buy(s, KNIFE); assert.deepEqual(goods(r), { food: 41, wood: 0, clay: 0, grain: 0 }); passed(r, KNIFE)
  })
  it('A007 N7 whole passing purchase undo restores board goods and both hands', () => {
    const s = setup(KNIFE, { wood: 1 }, state => fields(state.players[0]!, [['grain', 3], ['vegetable', 2]])); const before = undoRuleSnapshot(s.getState())
    passed(buy(s, KNIFE), KNIFE); assertUndoRestored(before, s.undoAction()); const r = buy(s, KNIFE); assert.deepEqual(goods(r), { food: 41, wood: 0, clay: 0, grain: 1 }); passed(r, KNIFE)
  })
})

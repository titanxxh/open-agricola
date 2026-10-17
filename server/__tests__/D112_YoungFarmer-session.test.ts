import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit48Crops from './_helpers/audit/ae-negative-48-crops'

describe('ae-negative-48-crops', () => {
  const { sessions, ok, save, setup, choose, finish, next, grainField, sow, improvement } = audit48Crops
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D112 N1 real Major Improvement gives grain before usual paid Fireplace and may sow or decline afterwards', () => {
    for (const accept of [true, false]) {
      const s = setup('D112_YoungFarmer', 14, state => { state.players[0]!.resources.clay = 2; grainField(state, 0); })
      let r = ok(s.takeAction(0, 'major-improvement'))
      assert.equal(r.state.players[0]!.resources.grain, 1)
      r = improvement(s, r, 'Major_Fireplace1')
      assert.equal(r.state.players[0]!.resources.clay, 0)
      r = accept ? sow(s, r) : finish(s, r)
      assert.equal(r.state.players[0]!.resources.grain, accept ? 0 : 1)
      assert.equal(r.state.players[0]!.fields[0]!.stacks[0]?.remaining ?? 0, accept ? 3 : 0)
      save(`D112-N1-${accept}`, r)
    }
  })
  it('D112 N2 unrelated Forest and actual opponent Major Improvement grant owner no grain or sow', () => {
    const s = setup('D112_YoungFarmer', 14, state => state.players[1]!.resources.clay = 2)
    finish(s, ok(s.takeAction(0, 'forest')))
    next(s)
    let r = ok(s.takeAction(1, 'major-improvement'))
    if (!r.state.players[1]!.improvements.includes('Major_Fireplace1'))
      r = choose(s, r, o => o.value === 'Major_Fireplace1')
    r = finish(s, r)
    assert.equal(r.state.players[0]!.resources.grain, 0)
    assert.equal(r.state.players[1]!.resources.grain, 0)
    save('D112-N2', r)
  })
  it('D112 N3 building a major Basket from Meeting Place via Braid Maker is not the Major Improvement action space', () => { const s = setup('D112_YoungFarmer', 14, state => { state.players[0]!.occupationPlayed.push('E109_BraidMaker'); Object.assign(state.players[0]!.resources, { reed: 1, stone: 1 }); state.players[0]!.minorHand = ['B007_Wage']; grainField(state, 0); }); const r = improvement(s, ok(s.takeAction(0, 'meeting-place')), 'Major_Basket'); assert.equal(r.state.players[0]!.resources.grain, 0); assert.equal(r.state.players[0]!.fields[0]!.stacks.length, 0); assert.equal(r.state.players[0]!.resources.reed, 0); assert.equal(r.state.players[0]!.resources.stone, 0); save('D112-N3', r); })
})

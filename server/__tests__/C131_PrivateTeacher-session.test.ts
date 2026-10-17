import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRuleOutcome } from './_helpers/negative-rule-audit'
import * as audit51Family from './_helpers/audit/ae-negative-51-family'

describe('ae-negative-51-family', () => {
  const { sessions, save, setup, choose, finish, offer, take, teacher } = audit51Family
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C131 N1 actual opponent Lessons occupancy allows exactly one occupation for one food on Grain Seeds', () => {
    const s = setup('C131_PrivateTeacher')
    let r = offer(s, teacher(s, 'A125_Priest'), 'C131_PrivateTeacher')
    r = choose(s, r, o => o.value === 'A125_Priest' || !['__skip__', '__pass__'].includes(o.value))
    if (!r.state.players[0]!.occupationPlayed.includes('A125_Priest'))
      r = choose(s, r, o => o.value === 'A125_Priest')
    r = finish(s, r)
    assert.ok(r.state.players[0]!.occupationPlayed.includes('A125_Priest'))
    assert.equal(r.state.players[0]!.resources.food, 19)
    assert.equal(r.state.players[0]!.resources.grain, 1)
    save('C131-N1', r)
  })
  it('C131 N2 vacant Lessons optional decline and zero food do not play the held occupation', () => {
    for (const mode of ['vacant', 'decline', 'short']) {
      const s = setup('C131_PrivateTeacher'), r = finish(s, teacher(s, 'A125_Priest', mode === 'short' ? 0 : 20, mode !== 'vacant'))
      assert.ok(!r.state.players[0]!.occupationPlayed.includes('A125_Priest'))
      assert.equal(r.state.players[0]!.resources.food, mode === 'short' ? 0 : 20)
      assert.equal(r.state.players[0]!.resources.grain, 1)
      save(`C131-N2-${mode}`, r)
    }
  })
  it('C131 N3 Grain Seeds occupation played by Private Teacher immediately triggers its Grain Seeds ability', () => {
    const ctl = setup('C131_PrivateTeacher', 14, state => state.players[0]!.occupationPlayed = ['B142_Greengrocer'])
    const legal = finish(ctl, take(ctl, 'grain-seeds'))
    assert.equal(legal.state.players[0]!.resources.vegetable, 1)
    save('C131-N3-control', legal)
    const s = setup('C131_PrivateTeacher')
    let r = offer(s, teacher(s, 'B142_Greengrocer'), 'C131_PrivateTeacher')
    r = choose(s, r, o => o.value === 'B142_Greengrocer' || !['__skip__', '__pass__'].includes(o.value))
    if (!r.state.players[0]!.occupationPlayed.includes('B142_Greengrocer'))
      r = choose(s, r, o => o.value === 'B142_Greengrocer')
    r = finish(s, r)
    assert.ok(r.state.players[0]!.occupationPlayed.includes('B142_Greengrocer'))
    assert.equal(r.state.players[0]!.resources.grain, 1)
    assert.equal(r.state.players[0]!.resources.wood, 3)
    assert.equal(r.state.players[0]!.resources.food, 19)
    save('C131-N3', r)
    assertRuleOutcome(r.state.players[0]!.resources.vegetable, 1, { id: 'OA-C131-N3-new-occupation-grain-trigger', observed: 0 })
  })
})

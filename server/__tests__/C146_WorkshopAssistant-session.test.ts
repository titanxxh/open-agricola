import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit54Resources from './_helpers/audit/ae-negative-54-resources'

describe('ae-negative-54-resources', () => {
  const { sessions, ok, gains, save, setup, choose, finish, next, play, offer, move } = audit54Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C146 N1 real onBuy validates unique pair selection then opponent renovations claim one finite pair each', () => {
    const s = setup('C146_WorkshopAssistant', 14, state => {
      state.players[0]!.improvements = ['Major_Fireplace1', 'Major_Pottery']
      for (const p of state.players)
        Object.assign(p.resources, { clay: 2, reed: 1 })
    })
    let r = play(s, 'C146_WorkshopAssistant')
    for (const bad of ['WC', 'WC,WC', 'WW,RS', 'WC,WR,RS']) {
      if (bad === 'WW,RS')
        assertRejectedUnchanged(s, () => s.resolveChoice(0, bad))
      else
        r = ok(s.resolveChoice(0, bad))
      assert.ok(r.interaction.stateId === 'wait')
      assert.equal(JSON.stringify(r.state.players[0]!.cardStates['C146_WorkshopAssistant']?.extraData?.pairs ?? []), '[]')
    }
    r = ok(s.resolveChoice(0, 'WC,RS'))
    assert.deepEqual(r.state.players[0]!.cardStates['C146_WorkshopAssistant']?.extraData?.pairs, ['WC', 'RS'])
    finish(s, r)
    next(s)
    r = offer(s, ok(s.takeAction(1, 'house-redevelopment')), 'C146_WorkshopAssistant')
    r = choose(s, r, o => gains(o, 'wood') === 1)
    r = finish(s, r)
    assert.equal(r.state.players[0]!.resources.wood, 1)
    assert.equal(r.state.players[0]!.resources.clay, 3)
    assert.deepEqual(r.state.players[0]!.cardStates['C146_WorkshopAssistant']?.extraData?.pairs, ['RS'])
    next(s)
    r = offer(s, ok(s.takeAction(2, 'farm-redevelopment')), 'C146_WorkshopAssistant')
    r = finish(s, r, true)
    assert.deepEqual(r.state.players[0]!.cardStates['C146_WorkshopAssistant']?.extraData?.pairs, [])
    assert.equal(r.state.players[0]!.resources.reed, 2)
    assert.equal(r.state.players[0]!.resources.stone, 1)
    save('C146-N1', r)
  })
  it('C146 N2 zero stock six pair cap and own renovation preserve created goods', () => {
    for (const n of [0, 2, 6, 7]) {
      const s = setup('C146_WorkshopAssistant', 14, state => { state.players[0]!.improvements = ['Major_Fireplace1', 'Major_Fireplace2', 'Major_Joinery', 'Major_Pottery', 'Major_Basket', 'Major_Well', 'Major_CookingHearth1'].slice(0, n); Object.assign(state.players[0]!.resources, { clay: 2, reed: 1 }); })
      let r = play(s, 'C146_WorkshopAssistant')
      if (n === 2)
        r = ok(s.resolveChoice(0, 'WC,RS'))
      r = finish(s, r)
      const count = Math.min(n, 6)
      assert.equal((readCardExtraData<string[]>(r.state.players[0]!, 'C146_WorkshopAssistant', 'pairs') ?? []).length, count)
      move(s, 'forest')
      move(s, 'reed-bank')
      r = move(s, 'house-redevelopment')
      assert.equal((readCardExtraData<string[]>(r.state.players[0]!, 'C146_WorkshopAssistant', 'pairs') ?? []).length, count)
      assert.equal(r.state.players[0]!.resources.wood, 0)
      save(`C146-N2-${n}`, r)
    }
  })
  it('C146 N3 opponent renovation decline leaves both pairs created by real occupation play', () => {
    const s = setup('C146_WorkshopAssistant', 14, state => { state.players[0]!.improvements = ['Major_Fireplace1', 'Major_Pottery']; Object.assign(state.players[1]!.resources, { clay: 2, reed: 1 }); })
    play(s, 'C146_WorkshopAssistant')
    let r = ok(s.resolveChoice(0, 'WC,RS'))
    finish(s, r)
    next(s)
    r = finish(s, ok(s.takeAction(1, 'house-redevelopment')))
    assert.deepEqual(r.state.players[0]!.cardStates['C146_WorkshopAssistant']?.extraData?.pairs, ['WC', 'RS'])
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.stone, 0)
    save('C146-N3', r)
  })
})

import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit31Plows from './_helpers/audit/ae-negative-31-plows'

describe('ae-negative-31-plows', () => {
  const { sessions, ok, options, actor, save, setup, choose, finish, completeRound, offer, take, hand, buy, noSource, accept, minorSetup } = audit31Plows
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D018 N1 real purchase pays printed cost and enforces missing resource or occupation', () => {
    const card = 'D018_SteamPlow', s = minorSetup(card, 1, 0, 20)
    s.state.players[0]!.resources.reed = 0
    s.loadState(s.state)
    const r = buy(s, card)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.reed, 0)
    assert.equal(r.state.players[0]!.resources.food, 19)
    assert.equal(r.scores![0]!.categories.find(c => c.key === 'cards')?.entries?.find(e => 'cardId' in e && e.cardId === card)?.score, 1)
    save('D018-N1-legal', r)
    {
      const t = minorSetup(card, 0, 0, 0, 14)
      t.state.players[0]!.resources.reed = 0
      t.loadState(t.state)
      let q = take(t, 'meeting-place')
      const branch = options(q).find(o => o.value.startsWith('action-improvement-'))
      if (branch)
        q = ok(t.resolveChoice(actor(q), branch.value))
      assert.ok(!options(q).some(o => o.value === card && !o.disabled), JSON.stringify(q.interaction))
      if (q.interaction.stateId === 'wait' && q.interaction.request.kind === 'choice')
        assertRejectedUnchanged(t, () => t.resolveChoice(actor(q), card))
      assert.ok(q.state.players[0]!.minorHand.includes(card))
      save('D018-N1-resource', q)
    }
  })
  it('D018 N2 natural returning home pays two wood one food and plows without a farmer', () => { const card = 'D018_SteamPlow', s = setup(card, 5, st => st.players[0]!.resources.wood = 2); let r = completeRound(s, ['grain-seeds', 'forest', 'clay-pit', 'reed-bank']); r = finish(s, accept(s, r, card), true); assert.equal(r.state.round, 6); assert.equal(r.state.players[0]!.fields.length, 1); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.food, 19); assert.ok(r.state.actionSpaces.every(a => a.takenBy.length === 0)); save('D018-N2', r); })
  it('D018 N3 decline hand-only and insufficient wood or food cannot buy return home field', () => {
    for (const mode of ['decline', 'hand', 'wood', 'food']) {
      const card = 'D018_SteamPlow', s = setup(card, 5, st => {
        Object.assign(st.players[0]!.resources, { wood: mode === 'wood' ? 1 : 2, food: mode === 'food' ? 0 : 20 })
        if (mode === 'hand')
          hand(st, card)
      })
      let r = completeRound(s, ['grain-seeds', 'forest', 'clay-pit', 'reed-bank'])
      if (mode === 'decline')
        r = choose(s, offer(s, r, card), o => o.value === '__skip__')
      else
        noSource(r, card)
      r = finish(s, r, true)
      assert.equal(r.state.players[0]!.fields.length, 0)
      assert.equal(r.state.players[0]!.resources.wood, mode === 'wood' ? 1 : 2)
      assert.equal(r.state.players[0]!.resources.food, mode === 'food' ? 0 : 20)
      save(`D018-N3-${mode}`, r)
    }
  })
  it('D018 N4 real Farmland use from Steam Plow must activate a second plow card', () => { const card = 'D018_SteamPlow', s = setup(card, 13, st => { st.players[0]!.resources.wood = 2; st.players[0]!.minorPlayed.push('C020_MolePlow'); }); let r = completeRound(s, ['grain-seeds', 'forest', 'clay-pit', 'reed-bank']); r = finish(s, accept(s, r, card), true); save('D018-N4', r); assert.equal(r.state.round, 14); assert.equal(r.state.players[0]!.fields.length, 2); })
})

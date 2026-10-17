import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit31Plows from './_helpers/audit/ae-negative-31-plows'

describe('ae-negative-31-plows', () => {
  const { sessions, ok, options, actor, save, setup, choose, finish, improvement, offer, take, prerequisites, hand, buy, noSource, accept, advanceOwner, minorSetup } = audit31Plows
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E018 N1 real purchase pays printed cost and enforces missing resource or occupation', () => {
    const card = 'E018_SeedAlmanac', s = minorSetup(card, 0, 4, 20)
    s.state.players[0]!.resources.reed = 1
    s.loadState(s.state)
    const r = buy(s, card)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.reed, 0)
    assert.equal(r.state.players[0]!.resources.food, 20)
    save('E018-N1-legal', r)
    {
      const t = minorSetup(card, 0, 4, 20, 14)
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
      save('E018-N1-resource', q)
    }
    {
      const t = minorSetup(card, 0, 3, 20, 14)
      t.state.players[0]!.resources.reed = 1
      t.loadState(t.state)
      let q = take(t, 'meeting-place')
      const branch = options(q).find(o => o.value.startsWith('action-improvement-'))
      if (branch)
        q = ok(t.resolveChoice(actor(q), branch.value))
      assert.ok(!options(q).some(o => o.value === card && !o.disabled), JSON.stringify(q.interaction))
      if (q.interaction.stateId === 'wait' && q.interaction.request.kind === 'choice')
        assertRejectedUnchanged(t, () => t.resolveChoice(actor(q), card))
      assert.ok(q.state.players[0]!.minorHand.includes(card))
      save('E018-N1-prerequisite', q)
    }
  })
  it('E018 N2 subsequent minor pays one food to plow while self purchase has no retroactive plow', () => { const card = 'E018_SeedAlmanac', s = setup(card, 14, st => { hand(st, card); prerequisites(st, 4); st.players[0]!.minorHand.push('E050_WildGreens'); Object.assign(st.players[0]!.resources, { reed: 1, food: 1 }); }); let r = buy(s, card); noSource(r, card); assert.equal(r.state.players[0]!.fields.length, 0); advanceOwner(s, r); r = improvement(s, take(s, 'major-improvement'), 'E050_WildGreens'); r = finish(s, accept(s, r, card), true); assert.equal(r.state.players[0]!.resources.food, 0); assert.equal(r.state.players[0]!.fields.length, 1); save('E018-N2', r); })
  it('E018 N3 decline unavailable food major purchase and hand-only later minor cannot plow', () => {
    for (const mode of ['decline', 'food', 'major', 'hand', 'opponent']) {
      const card = 'E018_SeedAlmanac', s = setup(card, 14, st => {
        prerequisites(st, 4)
        st.players[0]!.minorHand = ['E050_WildGreens']
        Object.assign(st.players[0]!.resources, { food: mode === 'food' ? 0 : 1, clay: 2 })
        if (mode === 'hand')
          st.players[0]!.minorPlayed = []
        if (mode === 'opponent') {
          st.currentPlayerIndex = 1
          st.players[1]!.minorHand = ['E050_WildGreens']
          st.players[0]!.minorHand = ['__test_placeholder__']
        }
      })
      let r = take(s, 'major-improvement')
      const actorIndex = mode === 'opponent' ? 1 : 0
      const target = mode === 'major' ? 'Major_Fireplace1' : 'E050_WildGreens'
      if (r.state.players[actorIndex]!.minorHand.includes(target) || mode === 'major') {
        if (!options(r).some(o => o.value === target))
          r = choose(s, r, o => o.value.startsWith('action-improvement-') || o.labelKey === 'actions.improvement.name')
        r = choose(s, r, o => o.value === target)
      }
      if (mode === 'decline')
        r = choose(s, offer(s, r, card), o => o.value === '__skip__')
      else {
        noSource(r, card)
        if (mode === 'food')
          assertRejectedUnchanged(s, () => s.resolveChoice(actor(r), 'flow-9'))
      }
      r = finish(s, r, true)
      assert.equal(r.state.players[0]!.fields.length, 0)
      assert.equal(r.state.players[0]!.resources.food, mode === 'food' ? 0 : 1)
      save(`E018-N3-${mode}`, r)
    }
  })
})

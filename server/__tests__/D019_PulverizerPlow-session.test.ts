import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit31Plows from './_helpers/audit/ae-negative-31-plows'

describe('ae-negative-31-plows', () => {
  const { sessions, ok, options, actor, save, setup, finish, take, hand, buy, noSource, minorSetup } = audit31Plows
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D019 N1 real purchase pays printed cost and enforces missing resource or occupation', () => {
    const card = 'D019_PulverizerPlow', s = minorSetup(card, 2, 1, 20)
    s.state.players[0]!.resources.reed = 0
    s.loadState(s.state)
    const r = buy(s, card)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.reed, 0)
    assert.equal(r.state.players[0]!.resources.food, 20)
    save('D019-N1-legal', r)
    {
      const t = minorSetup(card, 1, 1, 20, 14)
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
      save('D019-N1-resource', q)
    }
    {
      const t = minorSetup(card, 2, 0, 20, 14)
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
      save('D019-N1-prerequisite', q)
    }
  })
  it('D019 N2 actual clay space receives exact returned payment and legal field', () => { const card = 'D019_PulverizerPlow', s = setup(card); const r = finish(s, take(s, 'clay-pit'), true); assert.equal(r.state.players[0]!.resources.clay, 1); assert.equal(r.state.players[0]!.fields.length, 1); assert.equal(r.state.actionSpaces.find(a => a.id === 'clay-pit')!.resources.clay, 1); save('D019-N2', r); })
  it('D019 N3 decline unrelated hand opponent and empty insufficient clay leave no field', () => {
    for (const mode of ['decline', 'unrelated', 'hand', 'opponent', 'empty']) {
      const card = 'D019_PulverizerPlow', s = setup(card, 14, st => {
        if (mode === 'hand')
          hand(st, card)
        if (mode === 'opponent')
          st.currentPlayerIndex = 1
        if (mode === 'empty')
          st.actionSpaces.find(a => a.id === 'clay-pit')!.resources.clay = 0
      })
      if (mode === 'empty') { const r = assertEmptyAccumulationRejected(s, 0, 'clay-pit'); assert.equal(r.state.players[0]!.fields.length, 0); save('D019-N3-empty', r); continue }
      let r = take(s, mode === 'unrelated' ? 'forest' : 'clay-pit')
      if (['hand', 'opponent', 'unrelated'].includes(mode))
        noSource(r, card)
      if (mode === 'empty' && options(r).some(o => o.value === '__skip__'))
        assertRejectedUnchanged(s, () => s.resolveChoice(actor(r), 'action-return-to-space-0'))
      r = finish(s, r, mode !== 'decline')
      assert.equal(r.state.players[0]!.fields.length, 0)
      assert.equal(r.state.actionSpaces.find(a => a.id === 'clay-pit')!.resources.clay, mode === 'unrelated' ? 2 : 0)
      save(`D019-N3-${mode}`, r)
    }
    const s = setup('D019_PulverizerPlow', 14, st => { st.actionSpaces.find(a => a.id === 'clay-pit')!.resources.clay = 0; st.players[0]!.resources.clay = 1; })
    const r = assertEmptyAccumulationRejected(s, 0, 'clay-pit')
    assert.equal(r.state.players[0]!.fields.length, 0)
    assert.equal(r.state.players[0]!.resources.clay, 1)
    save('D019-N3-empty-owned-rejected', r)
  })
})

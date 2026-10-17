import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { C020_MolePlow } from '../../shared/cards/C/C020_MolePlow'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit31Plows from './_helpers/audit/ae-negative-31-plows'

describe('C020_MolePlow prerequisite', () => {
  it('blocks when round < 9', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.round = 8
    const player = state.players[0]!
    expect(session.withCtx(() => meetsCardPrerequisites(player, C020_MolePlow, state.round, state))).toBe(false)
  })

  it('allows when round >= 9', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.round = 9
    const player = state.players[0]!
    expect(session.withCtx(() => meetsCardPrerequisites(player, C020_MolePlow, state.round, state))).toBe(true)
  })
})

describe('ae-negative-31-plows', () => {
  const { sessions, ok, options, actor, save, setup, finish, take, hand, buy, noSource, minorSetup } = audit31Plows
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C020 N1 real purchase pays printed cost and enforces missing resource or occupation', () => {
    const card = 'C020_MolePlow', s = minorSetup(card, 3, 0, 20)
    s.state.players[0]!.resources.reed = 0
    s.loadState(s.state)
    const r = buy(s, card)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.reed, 0)
    assert.equal(r.state.players[0]!.resources.food, 19)
    save('C020-N1-legal',r);const boundarySession=minorSetup(card,3,0,1,9);const boundaryResult=buy(boundarySession,card);assert.equal(boundaryResult.state.players[0]!.resources.food,0);assert.equal(boundaryResult.state.players[0]!.resources.wood,0);save('C020-N1-round9',boundaryResult)
    {
      const t = minorSetup(card, 2, 0, 0, 14)
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
      save('C020-N1-resource', q)
    }
    {
      const t = minorSetup(card, 3, 0, 20, 8)
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
      save('C020-N1-early', q)
    }
  })
  it('C020 N2 Farmland and Cultivation add exactly one optional field', () => {
    for (const space of ['farmland', 'cultivation']) {
      const card = 'C020_MolePlow', s = setup(card)
      const r = finish(s, take(s, space), true)
      assert.equal(r.state.players[0]!.fields.length, 2)
      save(`C020-N2-${space}`, r)
    }
  })
  it('C020 N3 decline hand-only unrelated action and opponent exclude additional field', () => {
    for (const mode of ['decline', 'hand', 'unrelated', 'opponent']) {
      const card = 'C020_MolePlow', s = setup(card, 14, st => {
        if (mode === 'hand')
          hand(st, card)
        if (mode === 'opponent')
          st.currentPlayerIndex = 1
      })
      let r = take(s, mode === 'unrelated' ? 'grain-seeds' : 'farmland')
      if (mode !== 'decline')
        noSource(r, card)
      r = finish(s, r, mode !== 'decline')
      assert.equal(r.state.players[0]!.fields.length, ['opponent', 'unrelated'].includes(mode) ? 0 : 1)
      save(`C020-N3-${mode}`, r)
    }
  })
})

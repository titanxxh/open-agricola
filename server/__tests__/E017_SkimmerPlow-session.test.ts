import { describe, expect, it, afterEach } from 'vitest'
import { setupSowingSession, sowCrops } from './_helpers/batch07-sowing'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/E/E017_SkimmerPlow'
import '../../shared/cards/D/D075_WoodField'
import '../../shared/cards/E/E080_RockGarden'
import assert from 'node:assert/strict'
import fs from './_helpers/audit-evidence-fs'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit31Plows from './_helpers/audit/ae-negative-31-plows'

describe('E017 Skimmer Plow through Session', () => {
  it('places one fewer grain or vegetable on every field sown', () => {
    const session = setupSowingSession({ cardId: 'E017_SkimmerPlow', grain: 1, vegetable: 1 })
    session.state.players[0]!.fields = [
      { row: 0, col: 2, stacks: [] },
      { row: 1, col: 2, stacks: [] },
    ]
    session.loadState(session.state)
    const response = sowCrops(session, [
      { row: 0, col: 2, crop: 'grain' },
      { row: 1, col: 2, crop: 'vegetable' },
    ])
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields.map((field) => field.stacks[0]?.remaining)).toEqual([2, 1])
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 0 })
  })

  it('places one fewer wood or stone on card fields sown', () => {
    const session = setupSowingSession({
      cardId: 'E017_SkimmerPlow', wood: 1, stone: 1,
    })
    session.state.players[0]!.minorPlayed.push('D075_WoodField', 'E080_RockGarden')
    session.loadState(session.state)

    const response = sowCrops(session, [
      { row: -1, col: 4075, crop: 'wood' },
      { row: -1, col: 5080, crop: 'stone' },
    ])

    expect(response.ok, response.error).toBe(true)
    expect(readCardExtraData(response.state.players[0]!, 'D075_WoodField', 'cardFieldStacks'))
      .toEqual([{ crop: 'wood', remaining: 2 }, null])
    expect(readCardExtraData(response.state.players[0]!, 'E080_RockGarden', 'cardFieldStacks'))
      .toEqual([{ crop: 'stone', remaining: 1 }, null, null])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 0 })
  })
})

describe('ae-negative-31-plows', () => {
  const { sessions, ok, options, actor, save, setup, finish, take, hand, buy, noSource, plow, accept, sow, minorSetup } = audit31Plows
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E017 N1 real purchase pays printed cost and enforces missing resource or occupation', () => {
    const card = 'E017_SkimmerPlow', s = minorSetup(card, 1, 2, 20)
    s.state.players[0]!.resources.reed = 0
    s.loadState(s.state)
    const r = buy(s, card)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.reed, 0)
    assert.equal(r.state.players[0]!.resources.food, 20)
    save('E017-N1-legal', r)
    {
      const t = minorSetup(card, 0, 2, 20, 14)
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
      save('E017-N1-resource', q)
    }
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
      save('E017-N1-prerequisite', q)
    }
  })
  it('E017 N2 both action spaces plow two and each newly sown grain and vegetable field has one fewer good', () => {
    for (const space of ['farmland', 'cultivation']) {
      const card = 'E017_SkimmerPlow', s = setup(card, 14, st => { Object.assign(st.players[0]!.resources, { grain: 1, vegetable: 1 }); })
      let r = take(s, space)
      r = plow(s, accept(s, r, card))
      r = plow(s, r)
      assert.equal(r.state.players[0]!.fields.length, 2)
      if (space === 'cultivation') {
        const fs = r.state.players[0]!.fields
        r = sow(s, r, [{ ...fs[0]!, crop: 'grain' }, { ...fs[1]!, crop: 'vegetable' }])
        assert.deepEqual(r.state.players[0]!.fields.map(f => f.stacks), [[{ kind: 'grain', remaining: 2 }], [{ kind: 'vegetable', remaining: 1 }]])
        assert.equal(r.state.players[0]!.resources.grain, 0)
        assert.equal(r.state.players[0]!.resources.vegetable, 0)
      }
      r = finish(s, r)
      save(`E017-N2-${space}`, r)
    }
  })
  it('E017 N3 declining extra plow still reduces unrelated unconditional Sow while hand and opponent do not', () => {
    const card = 'E017_SkimmerPlow', s = setup(card, 14, st => { st.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }]; st.players[0]!.resources.grain = 1; })
    let r = take(s, 'grain-utilization')
    r = sow(s, r, [{ row: 0, col: 2, crop: 'grain' }])
    assert.deepEqual(r.state.players[0]!.fields[0]!.stacks, [{ kind: 'grain', remaining: 2 }])
    save('E017-N3-sow', r)
    for (const mode of ['decline', 'hand', 'opponent']) {
      const t = setup(card, 14, st => {
        if (mode === 'hand')
          hand(st, card)
        if (mode === 'opponent')
          st.currentPlayerIndex = 1
      })
      let q = take(t, 'farmland')
      if (mode !== 'decline')
        noSource(q, card)
      q = finish(t, q, mode !== 'decline')
      assert.equal(q.state.players[mode === 'opponent' ? 1 : 0]!.fields.length, 1)
      save(`E017-N3-${mode}`, q)
    }
  })
})

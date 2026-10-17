import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { familySize } from '../../shared/domain/player'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit31Plows from './_helpers/audit/ae-negative-31-plows'

describe('ae-negative-31-plows', () => {
  const { sessions, ok, options, actor, save, setup, choose, finish, completeRound, offer, take, hand, buy, noSource, accept, minorSetup, legalRounds } = audit31Plows
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C021 N1 real purchase pays printed cost and enforces missing resource or occupation', () => {
    const card = 'C021_HeartofStone', s = minorSetup(card, 0, 0, 20)
    s.state.players[0]!.resources.reed = 0
    s.loadState(s.state)
    const r = buy(s, card)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.reed, 0)
    assert.equal(r.state.players[0]!.resources.food, 16)
    save('C021-N1-legal', r)
    {
      const t = minorSetup(card, 0, 0, 3, 14)
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
      save('C021-N1-resource', q)
    }
  })
  it('C021 N2 natural legal Quarry revelation grows without occupying an action and may be declined', () => {
    for (const acceptGrowth of [true, false]) {
      const card = 'C021_HeartofStone', s = setup(card, 6, st => { st.roundActionOrder = [...legalRounds]; const p = st.players[0]!; p.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }]; p.rooms = 3; })
      let r = completeRound(s)
      r = offer(s, r, card)
      assert.equal(r.state.round, 7)
      assert.equal(r.interaction.stateId, 'wait')
      if (r.interaction.stateId === 'wait')
        assert.equal(r.interaction.sourceCard, card)
      save(`C021-N2-before-${acceptGrowth}`, r)
      r = acceptGrowth ? accept(s, r, card) : choose(s, r, o => o.value === '__skip__')
      r = finish(s, r)
      assert.equal(familySize(r.state.players[0]!), acceptGrowth ? 3 : 2)
      assert.ok(r.state.actionSpaces.every(a => a.takenBy.length === 0))
      save(`C021-N2-${acceptGrowth}`, r)
    }
  })
  it('C021 N3 no free room hand-only and nonQuarry reveal cannot grow the owner', () => {
    for (const mode of ['full', 'hand', 'nonQuarry']) {
      const card = 'C021_HeartofStone', s = setup(card, mode === 'nonQuarry' ? 5 : 6, st => {
        st.roundActionOrder = [...legalRounds]
        if (mode !== 'full') {
          st.players[0]!.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }]
          st.players[0]!.rooms = 3
        }
        if (mode === 'hand')
          hand(st, card)
      })
      let r = completeRound(s)
      noSource(r, card)
      r = finish(s, r, true)
      assert.equal(familySize(r.state.players[0]!), 2)
      save(`C021-N3-${mode}`, r)
    }
  })
  it('C021 N4 Eastern Quarry stage four natural revelation is distinct from local fixed mapping', () => { const card = 'C021_HeartofStone', s = setup(card, 10, st => { st.roundActionOrder = [...legalRounds]; st.players[0]!.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }]; st.players[0]!.rooms = 3; }); let r = completeRound(s); r = finish(s, accept(s, r, card)); assert.equal(r.state.round, 11); assert.equal(familySize(r.state.players[0]!), 3); save('C021-N4', r); })
})

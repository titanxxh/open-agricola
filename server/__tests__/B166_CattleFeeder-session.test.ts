import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit31Plows from './_helpers/audit/ae-negative-31-plows'

describe('ae-negative-31-plows', () => {
  const { sessions, actor, save, setup, finish, lesson, take, noSource, accept, pasture, animalKeep } = audit31Plows
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('B166 N1 Grain Seeds exact one food purchase keeps cattle in a legal pasture', () => { const card = 'B166_CattleFeeder', s = setup(card, 14, st => { st.players[0]!.resources.food = 1; pasture(st, [{ row: 0, col: 3 }]); }); let r = accept(s, take(s, 'grain-seeds'), card); r = animalKeep(s, r, req => { const z = req.zones.find(z => z.id === 'p1')!; z.animalType = 'cattle'; z.animalCount = 1; }); r = finish(s, r); assert.equal(r.state.players[0]!.resources.food, 0); assert.equal(r.state.players[0]!.resources.grain, 1); assert.equal(r.state.players[0]!.resources.cattle, 1); assert.equal(r.state.players[0]!.pastures[0]!.animalType, 'cattle'); save('B166-N1', r); })
  it('B166 N2 decline zero food hand-only opponent and unrelated action cannot buy cattle', () => {
    for (const mode of ['decline', 'food', 'hand', 'opponent', 'unrelated']) {
      const card = 'B166_CattleFeeder', s = setup(card, 14, st => {
        st.players[0]!.resources.food = mode === 'food' ? 0 : 1
        pasture(st, [{ row: 0, col: 3 }])
        if (mode === 'hand') {
          st.players[0]!.occupationPlayed = []
          st.players[0]!.occupationHand = [card]
        }
        if (mode === 'opponent')
          st.currentPlayerIndex = 1
      })
      let r = take(s, mode === 'unrelated' ? 'reed-bank' : 'grain-seeds')
      if (['hand', 'opponent', 'unrelated', 'food'].includes(mode))
        noSource(r, card)
      if (mode === 'food')
        assertRejectedUnchanged(s, () => s.resolveChoice(actor(r), 'flow-7'))
      r = finish(s, r, mode !== 'decline')
      assert.equal(r.state.players[0]!.resources.cattle, 0)
      assert.equal(r.state.players[0]!.resources.food, mode === 'food' ? 0 : 1)
      save(`B166-N2-${mode}`, r)
    }
  })
  it('B166 N3 real first occupation play itself grants no cattle until Grain Seeds', () => { const card = 'B166_CattleFeeder', s = setup(card, 14, st => { st.players[0]!.occupationPlayed = []; st.players[0]!.occupationHand = [card]; pasture(st, [{ row: 0, col: 3 }]); }); const r = finish(s, lesson(s, card), true); assert.ok(r.state.players[0]!.occupationPlayed.includes(card)); assert.equal(r.state.players[0]!.resources.cattle, 0); assert.equal(r.state.players[0]!.resources.food, 20); save('B166-N3', r); })
})

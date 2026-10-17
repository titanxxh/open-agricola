import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit34Scoring from './_helpers/audit/ae-negative-34-scoring'

describe('ae-negative-34-scoring', () => {
  const { sessions, save, setup, choose, finish, completeRound, offer, prerequisites, hand, buy, noSource, accept, bonus, printed, denyMinor } = audit34Scoring
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C034 N1 real printed purchase pays exact cost and excludes insufficient resources or prerequisite', () => { const card = 'C034_ElephantgrassPlant', s = setup(card, 14, st => { hand(st, card); prerequisites(st, 2); Object.assign(st.players[0]!.resources, { food: 40, clay: 2, stone: 1 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 0); assert.equal(r.state.players[0]!.resources.clay, 0); assert.equal(r.state.players[0]!.resources.stone, 0); save('C034-N1-legal', r); {
      const t = setup(card, 14, st => { hand(st, card); prerequisites(st, 2); st.players[0]!.houseType = 'wood'; Object.assign(st.players[0]!.resources, { food: 40, clay: 1, stone: 1 }); });
      const q = denyMinor(t, card);
      assert.equal(printed(q, card), 0);
      save('C034-N1-resource', q);
  } {
      const t = setup(card, 14, st => { hand(st, card); prerequisites(st, 1); st.players[0]!.houseType = 'wood'; Object.assign(st.players[0]!.resources, { food: 40, clay: 2, stone: 1 }); });
      const q = denyMinor(t, card);
      assert.equal(printed(q, card), 0);
      save('C034-N1-occupation', q);
  } });
  it('C034 N2 each natural harvest exchanges exactly one reed and intervening round offers no exchange', () => { const card = 'C034_ElephantgrassPlant', s = setup(card, 4, st => st.players[0]!.resources.reed = 3); let r = completeRound(s); r = finish(s, accept(s, r, card), true); assert.equal(r.state.round, 5); assert.equal(r.state.players[0]!.resources.reed, 2); assert.equal(bonus(r, card), 1); save('C034-N2-first', r); r = finish(s, completeRound(s), true); assert.equal(r.state.round, 6); assert.equal(bonus(r, card), 1); assert.equal(r.state.players[0]!.resources.reed, 2); r = finish(s, completeRound(s), true); assert.equal(r.state.round, 7); assert.equal(bonus(r, card), 1); r = finish(s, accept(s, completeRound(s), card), true); assert.equal(r.state.round, 8); assert.equal(r.state.players[0]!.resources.reed, 1); assert.equal(bonus(r, card), 2); save('C034-N2-second', r); });
  it('C034 N3 declined missing reed and hand-only harvest cannot create points or charge resources', () => { for (const mode of ['decline', 'zero', 'hand']) {
      const card = 'C034_ElephantgrassPlant', s = setup(card, 4, st => { st.players[0]!.resources.reed = mode === 'zero' ? 0 : 1; if (mode === 'hand')
          hand(st, card); });
      let r = completeRound(s);
      if (mode === 'decline')
          r = choose(s, offer(s, r, card), o => o.value === '__skip__');
      else
          noSource(r, card);
      r = finish(s, r, true);
      assert.equal(bonus(r, card), 0);
      assert.equal(r.state.players[0]!.resources.reed, mode === 'zero' ? 0 : 1);
      save(`C034-N3-${mode}`, r);
  } });
})

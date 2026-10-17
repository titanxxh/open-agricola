import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { readScheduledOffers } from '../../shared/actions/effects/internal/scheduled-offers'
import * as audit40Crops from './_helpers/audit/ae-negative-40-crops'

describe('ae-negative-40-crops', () => {
  const { sessions, options, save, setup, choose, finish, prerequisites, hand, buy, noSource, printed, denyMinor, advance, greenhouse } = audit40Crops
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D069 N1 actual hand purchase pays printed cost and meets each prerequisite', () => { const card = 'D069_SmallGreenhouse'; const s = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, { "wood": 2 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 1); assert.equal(r.state.players[0]!.resources.wood, 0); save("D069-N1-legal", r); const t = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, { "wood": 1 }); }); denyMinor(t, card); save("D069-N1-short", t.getState()); const excluded = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, { "wood": 2 }); prerequisites(st, 0); }); denyMinor(excluded, card); save("D069-N1-prerequisite", excluded.getState()); });
  it('D069 N2 real scheduled vegetables are paid only at their natural due rounds', () => { const card = 'D069_SmallGreenhouse', s = setup(card, 6, st => { hand(st, card); st.players[0]!.resources.wood = 2; }); let r = finish(s, buy(s, card)); save('D069-N2-purchased', r); for (let round = 7; round <= 13; round++) {
      r = advance(s);
      if ([10, 13].includes(round)) {
          r = greenhouse(s, r, round);
          save(`D069-N2-offer-${round}`, r);
          const before = r.state.players[0]!.resources.food;
          r = choose(s, r, o => o.value === `purchase:${card}-${round}`);
          assert.equal(r.state.players[0]!.resources.food, before - 1);
      }
      r = finish(s, r);
      assert.equal(r.state.players[0]!.resources.vegetable, round < 10 ? 0 : round < 13 ? 1 : 2);
      save(`D069-N2-${round}`, r);
  } assert.equal(r.state.players[0]!.resources.food, 26); });
  it('D069 N3 late hand and unaffordable due offers cannot grant a free vegetable', () => { for (const [round, targets] of [[10, [14]], [11, []]] as const) {
      const card = 'D069_SmallGreenhouse', s = setup(card, round, st => { hand(st, card); st.players[0]!.resources.wood = 2; });
      const r = buy(s, card);
      save(`D069-N3-late-${round}`, r);
      const extra = readScheduledOffers(r.state.players[0]!, card);
      assert.deepEqual(extra.map(o => o.dueRound), targets);
  } const card = 'D069_SmallGreenhouse', s = setup(card, 6, st => { hand(st, card); Object.assign(st.players[0]!.resources, { wood: 2, food: 8 }); }); finish(s, buy(s, card)); let r = s.getState(); for (let round = 7; round <= 10; round++) {
      r = advance(s);
      if (round < 10)
          r = finish(s, r);
  } r = finish(s, r); save('D069-N3-no-food-auto-unavailable', r); assert.equal(r.state.players[0]!.resources.food, 0); assert.equal(r.state.players[0]!.resources.vegetable, 0); noSource(r, card); });
  it('D069 N4 an affordable natural due offer can be explicitly declined without payment or later retry', () => { const card = 'D069_SmallGreenhouse', s = setup(card, 6, st => { hand(st, card); Object.assign(st.players[0]!.resources, { wood: 2, food: 9 }); }); finish(s, buy(s, card)); let r = s.getState(); for (let round = 7; round <= 10; round++) {
      r = advance(s);
      if (round < 10)
          r = finish(s, r);
  } r = greenhouse(s, r, 10); assert.equal(r.state.players[0]!.resources.food, 1); assert.ok(options(r).some(o => o.value === `purchase:${card}-10` && !o.disabled)); save('D069-N4-before-decline', r); r = choose(s, r, o => o.value === '__skip__'); r = finish(s, r); assert.equal(r.state.players[0]!.resources.food, 1); assert.equal(r.state.players[0]!.resources.vegetable, 0); r = finish(s, advance(s)); assert.equal(r.state.round, 11); assert.equal(r.state.players[0]!.resources.vegetable, 0); assert.equal(r.state.players[0]!.resources.food, 1); noSource(r, card); save('D069-N4', r); });
})

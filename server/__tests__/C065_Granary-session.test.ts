import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit40Crops from './_helpers/audit/ae-negative-40-crops'

describe('ae-negative-40-crops', () => {
  const { sessions, save, setup, finish, hand, buy, printed, denyMinor, futureRounds, advance } = audit40Crops
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C065 N1 actual hand purchase pays printed cost and meets each prerequisite', () => { const card = 'C065_Granary'; const s = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, { "wood": 3 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 1); assert.equal(r.state.players[0]!.resources.wood, 0); save("C065-N1-legal", r); const t = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, { "wood": 2 }); }); denyMinor(t, card); save("C065-N1-short", t.getState()); });
  it('C065 N2 real purchase schedules future grain and natural rounds deliver each once', () => { const card = 'C065_Granary', s = setup(card, 7, st => { hand(st, card); st.players[0]!.resources.wood = 3; }); let r = finish(s, buy(s, card)); assert.deepEqual(futureRounds(s, card), [8, 10, 12]); save('C065-N2-purchased', r); for (const [round, grain] of [[8, 1], [9, 1], [10, 2], [11, 2], [12, 3]]) {
      r = finish(s, advance(s));
      assert.equal(r.state.round, round);
      assert.equal(r.state.players[0]!.resources.grain, grain);
      assert.equal(r.state.players[1]!.resources.grain, 0);
      save(`C065-N2-${round}`, r);
  } assert.deepEqual(futureRounds(s, card), []); });
  it('C065 N3 late and hand purchases exclude past rounds and alternative material pays exactly', () => { for (const [round, expected] of [[10, [12]], [12, []], [14, []]] as const) {
      const card = 'C065_Granary', s = setup(card, round, st => { hand(st, card); st.players[0]!.resources.wood = 3; });
      const r = finish(s, buy(s, card));
      assert.deepEqual(futureRounds(s, card), expected);
      assert.equal(r.state.players[0]!.resources.grain, 0);
      save(`C065-N3-${round}`, r);
  } const card = 'C065_Granary', s = setup(card, 7, st => hand(st, card)); let r = finish(s, advance(s)); assert.equal(r.state.players[0]!.resources.grain, 0); assert.deepEqual(futureRounds(s, card), []); save('C065-N3-hand', r); const clay = setup(card, 10, st => { hand(st, card); st.players[0]!.resources.clay = 3; }); r = buy(clay, card); assert.equal(r.state.players[0]!.resources.clay, 0); assert.deepEqual(futureRounds(clay, card), [12]); save('C065-N3-clay', r); });
})

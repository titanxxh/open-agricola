import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit40Crops from './_helpers/audit/ae-negative-40-crops'

describe('ae-negative-40-crops', () => {
  const { sessions, save, setup, finish, hand, buy, printed, denyMinor, futureRounds, advance } = audit40Crops
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D067 N1 actual hand purchase pays printed cost and meets each prerequisite', () => { const card = 'D067_ReapHook'; const s = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, { "wood": 1 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 0); assert.equal(r.state.players[0]!.resources.wood, 0); save("D067-N1-legal", r); const t = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, { "wood": 0 }); }); denyMinor(t, card); save("D067-N1-short", t.getState()); });
  it('D067 N2 real purchase schedules future grain and natural rounds deliver each once', () => { const card = 'D067_ReapHook', s = setup(card, 6, st => { hand(st, card); st.players[0]!.resources.wood = 1; }); let r = finish(s, buy(s, card)); assert.deepEqual(futureRounds(s, card), [7, 9, 11]); save('D067-N2-purchased', r); for (const [round, grain] of [[7, 1], [8, 1], [9, 2], [10, 2], [11, 3]]) {
      r = finish(s, advance(s));
      assert.equal(r.state.round, round);
      assert.equal(r.state.players[0]!.resources.grain, grain);
      assert.equal(r.state.players[1]!.resources.grain, 0);
      save(`D067-N2-${round}`, r);
  } assert.deepEqual(futureRounds(s, card), []); });
  it('D067 N3 late and hand purchases exclude past rounds and alternative material pays exactly', () => { for (const [round, expected] of [[11, [13, 14]], [14, []]] as const) {
      const card = 'D067_ReapHook', s = setup(card, round, st => { hand(st, card); st.players[0]!.resources.wood = 1; });
      const r = finish(s, buy(s, card));
      assert.deepEqual(futureRounds(s, card), expected);
      assert.equal(r.state.players[0]!.resources.grain, 0);
      save(`D067-N3-${round}`, r);
  } const card = 'D067_ReapHook', s = setup(card, 7, st => hand(st, card)); const r = finish(s, advance(s)); assert.equal(r.state.players[0]!.resources.grain, 0); assert.deepEqual(futureRounds(s, card), []); save('D067-N3-hand', r); });
})

import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit40Crops from './_helpers/audit/ae-negative-40-crops'

describe('ae-negative-40-crops', () => {
  const { sessions, save, setup, finish, prerequisites, hand, buy, noSource, printed, denyMinor, completeRemaining } = audit40Crops
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E065 N1 actual hand purchase pays printed cost and meets each prerequisite', () => { const card = 'E065_Almsbag'; const s = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, {}); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 0); assert.equal(r.state.players[0]!.resources.grain, 6); save("E065-N1-legal", r); const excluded = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, {}); prerequisites(st, 1); }); denyMinor(excluded, card); save("E065-N1-prerequisite", excluded.getState()); });
  it('E065 N2 completed rounds produce exact even and odd purchase boundaries', () => { for (const [round, grain] of [[1, 0], [2, 0], [3, 1], [4, 1], [13, 6], [14, 6]]) {
      const card = 'E065_Almsbag', s = setup(card, round!, st => hand(st, card));
      const r = buy(s, card);
      assert.equal(r.state.players[0]!.resources.grain, grain);
      save(`E065-N2-${round}`, r);
  } });
  it('E065 N3 hand card gives no grain and a real purchase cannot reward again next round', () => { for (const played of [false, true]) {
      const card = 'E065_Almsbag', s = setup(card, 5, st => hand(st, card));
      let r = s.getState();
      save(`E065-N3-initial-${played}`,r);
      if (played) {
          r = finish(s, buy(s, card));
          assert.equal(r.state.players[0]!.resources.grain, 2);
      }
      r = finish(s, completeRemaining(s));
      assert.equal(r.state.round, 6);
      assert.equal(r.state.players[0]!.resources.grain, played ? 2 : 0);
      noSource(r, card);
      save(`E065-N3-${played}`, r);
  } });
})

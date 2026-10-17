import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertEmptyAccumulationRejected } from './_helpers/negative-rule-audit'
import * as audit40Crops from './_helpers/audit/ae-negative-40-crops'

describe('ae-negative-40-crops', () => {
  const { sessions, ok, save, setup, finish, take, prerequisites, hand, buy, noSource, accept, printed, denyMinor } = audit40Crops
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D068 N1 actual hand purchase pays printed cost and meets each prerequisite', () => { const card = 'D068_SmallBasket'; const s = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, {}); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 0); save("D068-N1-legal", r); const excluded = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, {}); prerequisites(st, 1); }); denyMinor(excluded, card); save("D068-N1-prerequisite", excluded.getState()); });
  it('D068 N2 actual Reed Bank exchange pays one reed and a zero pile cannot fund a free vegetable', () => { for (const n of [0, 1, 2]) {
      const card = 'D068_SmallBasket', s = setup(card, 14, st => { st.actionSpaces.find(a => a.id === 'reed-bank')!.resources.reed = n; });
      let r = n === 0 ? assertEmptyAccumulationRejected(s, 0, 'reed-bank') : take(s, 'reed-bank');
      save(`D068-N2-offer-${n}`, r);
      if (n)
          r = finish(s, accept(s, r, card), true);
      else {
          r = finish(s, r);
          assert.equal(r.state.players[0]!.resources.reed, 0);
      }
      assert.equal(r.state.players[0]!.resources.vegetable, n ? 1 : 0);
      assert.equal(r.state.players[0]!.resources.reed, n ? n - 1 : 0);
      assert.equal(r.state.actionSpaces.find(a => a.id === 'reed-bank')!.resources.reed, 0);
      save(`D068-N2-${n}`, r);
  } });
  it('D068 N3 decline hand opponent and unrelated actions exclude the Reed Bank exchange', () => { for (const mode of ['decline', 'hand', 'opponent', 'unrelated']) {
      const card = 'D068_SmallBasket', s = setup(card, 14, st => { if (mode === 'hand')
          hand(st, card); if (mode === 'opponent')
          st.currentPlayerIndex = 1; });
      let r = ok(s.takeAction(mode === 'opponent' ? 1 : 0, mode === 'unrelated' ? 'forest' : 'reed-bank'));
      if (mode !== 'decline')
          noSource(r, card);
      r = finish(s, r);
      assert.equal(r.state.players[0]!.resources.vegetable, 0);
      assert.equal(r.state.players[0]!.resources.reed, ['opponent', 'unrelated'].includes(mode) ? 0 : 2);
      save(`D068-N3-${mode}`, r);
  } });
  it('D068 N4 four players return the paid reed to the same physical Reed Bank accumulation pile', () => { const card = 'D068_SmallBasket', s = setup(card, 14, () => { }, 4); let r = take(s, 'reed-bank'); r = finish(s, accept(s, r, card), true); assert.equal(r.state.players.length, 4); assert.equal(r.state.players[0]!.resources.vegetable, 1); assert.equal(r.state.players[0]!.resources.reed, 1); assert.equal(r.state.actionSpaces.find(a => a.id === 'reed-bank')!.resources.reed, 1); save('D068-N4', r); });
})

import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit36Native from './_helpers/audit/ae-negative-36-native'

describe('ae-negative-36-native', () => {
  const { sessions, traces, save, make, end, final, purchase, rejectBuy, undo, resource, future, points } = audit36Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("C044 N1 both printed purchase alternatives schedule eight foods and receive the first after public undo and replay", () => { for (const mode of ['wood', 'clay', 'bothwood', 'bothclay']) {
      const cost = { wood: mode === 'clay' ? 0 : 2, clay: mode === 'wood' ? 0 : 2, reed: 1 }, s = make('C044_ChickenCoop', st => Object.assign(st.players[0]!.resources, cost), false), markers = [mode.endsWith('clay') || mode === 'clay' ? '"clay":2' : '"wood":2'], bought = purchase(s, 'C044_ChickenCoop', markers);
      resource(bought, { wood: mode === 'bothclay' ? 2 : 0, clay: mode === 'bothwood' ? 2 : 0, reed: 0 });
      assert.deepEqual(future(bought, 'C044_ChickenCoop'), [6, 7, 8, 9, 10, 11, 12, 13]);
      const u = undo(s);
      resource(u, cost);
      assert.deepEqual(future(u, 'C044_ChickenCoop'), []);
      purchase(s, 'C044_ChickenCoop', markers);
      const due = end(s);
      resource(due, { food: 101 });
      assert.deepEqual(future(due, 'C044_ChickenCoop'), [7, 8, 9, 10, 11, 12, 13]);
      save(`C044-N1-${mode}`, { bought, u, due });
  } });
  it("C044 N2 missing reed mixed insufficient alternatives and a held card cannot obtain Chicken Coop food", () => { for (const mode of ['reed', 'mixed', 'empty']) {
      const s = make('C044_ChickenCoop', st => Object.assign(st.players[0]!.resources, { wood: mode === 'reed' ? 2 : mode === 'mixed' ? 1 : 0, clay: mode === 'mixed' ? 1 : 0, reed: mode === 'reed' ? 0 : 1 }), false);
      save(`C044-N2-${mode}`, rejectBuy(s, 'C044_ChickenCoop'));
  } const s = make('C044_ChickenCoop', st => Object.assign(st.players[0]!.resources, { wood: 2, reed: 1 }), false), r = end(s, true, [], 'C044_ChickenCoop'); resource(r, { food: 100 }); assert.deepEqual(future(r, 'C044_ChickenCoop'), []); save('C044-N2-hand', r); });
  it("C044 N3 round thirteen and fourteen purchases truncate the eight-round schedule and retain printed scoring", () => { for (const round of [13, 14]) {
      const s = make('C044_ChickenCoop', st => Object.assign(st.players[0]!.resources, { clay: 2, reed: 1 }), false, round), r = purchase(s, 'C044_ChickenCoop');
      assert.deepEqual(future(r, 'C044_ChickenCoop'), round === 13 ? [14] : []);
      const done = round === 13 ? end(s) : final(s);
      if (round === 13)
          resource(done, { food: 97 });
      else
          assert.equal(points(done, 'C044_ChickenCoop'), 1);
      save(`C044-N3-${round}`, { r, done });
  } });
})

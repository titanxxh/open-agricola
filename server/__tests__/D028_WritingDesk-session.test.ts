import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit33Native from './_helpers/audit/ae-negative-33-native'

describe('ae-negative-33-native', () => {
  const { sessions, traces, save, make, take, finish, purchase, rejectBuy, resource, occupied, occupations } = audit33Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("D028 N1 real purchase with two occupations and Lessons plays exactly one additional occupation for two food", () => { const b = make('D028_WritingDesk', st => { occupations(st.players[0]!, 2); st.players[0]!.resources.wood = 1; }, false), bought = purchase(b, 'D028_WritingDesk'); resource(bought, { wood: 0 }); const s = make('D028_WritingDesk', st => occupations(st.players[0]!, 2)), p = take(s, 0, 'lessons'), r = finish(s, p, true, ['A125_Priest', 'A103_Portmonger']); resource(r, { food: 97 }); assert.ok(r.state.players[0]!.occupationPlayed.includes('A125_Priest')); assert.ok(r.state.players[0]!.occupationPlayed.includes('A103_Portmonger')); assert.equal(r.state.players[0]!.occupationPlayed.length, 4); assert.equal(occupied(r).length, 1); save('D028-N1', { bought, p, r }); });
  it("D028 N2 one playable card insufficient extra food and genuine decline give only ordinary Lessons", () => { for (const mode of ['one', 'food', 'decline']) {
      const s = make('D028_WritingDesk', st => { occupations(st.players[0]!, 2); st.players[0]!.resources.food = mode === 'decline' ? 3 : 1; if (mode === 'one')
          st.players[0]!.occupationHand = ['A125_Priest']; }), p = take(s, 0, 'lessons'), r = finish(s, p, mode !== 'decline', ['A125_Priest'], mode === 'decline' ? undefined : 'D028_WritingDesk');
      resource(r, { food: mode === 'decline' ? 2 : 0 });
      assert.equal(r.state.players[0]!.occupationPlayed.length, 3);
      save(`D028-N2-${mode}`, { p, r });
  } });
  it("D028 N3 missing purchase requirements held card foreign Lessons and unrelated work exclude an extra play", () => { for (const mode of ['occupation', 'wood']) {
      const s = make('D028_WritingDesk', st => { occupations(st.players[0]!, mode === 'occupation' ? 1 : 2); st.players[0]!.resources.wood = mode === 'wood' ? 0 : 1; }, false);
      save(`D028-N3-buy-${mode}`, rejectBuy(s, 'D028_WritingDesk'));
  } for (const mode of ['hand', 'opponent', 'unrelated']) {
      const a = mode === 'opponent' ? 1 : 0, s = make('D028_WritingDesk', st => { st.currentPlayerIndex = a; occupations(st.players[0]!, 2); }, mode !== 'hand'), r = finish(s, take(s, a, mode === 'unrelated' ? 'grain-seeds' : 'lessons'), true, ['A125_Priest'], 'D028_WritingDesk');
      assert.equal(r.state.players[0]!.occupationPlayed.length, mode === 'hand' ? 3 : 2);
      resource(r, { food: mode === 'hand' ? 99 : 100 });
      save(`D028-N3-${mode}`, r);
  } });
})

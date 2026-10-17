import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit33Native from './_helpers/audit/ae-negative-33-native'

describe('ae-negative-33-native', () => {
  const { sessions, traces, save, make, take, finish, ready, end, purchase, rejectBuy, resource, bonus, field } = audit33Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("C029 N1 real grain-free-supply purchase harvests a field then trades one grain for points and food to every opponent", () => { for (const players of [2, 4]) {
      const s = make('C029_BeerTable', st => { field(st.players[0]!, 2); st.players[0]!.resources.wood = 2; }, false, 4, players), bought = purchase(s, 'C029_BeerTable');
      resource(bought, { grain: 0, wood: 0 });
      const spaces = players === 2 ? [[1, 'clay-pit'], [0, 'forest'], [1, 'reed-bank']] : [[1, 'clay-pit'], [2, 'reed-bank'], [3, 'grove'], [0, 'forest'], [1, 'copse'], [2, 'hollow-4'], [3, 'grain-seeds']];
      for (const [a, space] of spaces) {
          assert.equal(ready(s).state.currentPlayerIndex, a);
          finish(s, take(s, Number(a), String(space)), false);
      }
      const r = end(s, true);
      resource(r, { grain: 0, food: 96 });
      for (let a = 1; a < players; a++)
          resource(r, { food: 97 }, a);
      assert.equal(bonus(r, 'C029_BeerTable'), 2);
      assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.remaining, 1);
      save(`C029-N1-${players}`, { bought, r });
  } });
  it("C029 N2 reserve grain wood shortage no grain and optional decline enforce the printed gates", () => { for (const mode of ['grain', 'wood']) {
      const s = make('C029_BeerTable', st => { Object.assign(st.players[0]!.resources, { wood: mode === 'wood' ? 1 : 2, grain: mode === 'grain' ? 1 : 0 }); }, false, 4);
      save(`C029-N2-buy-${mode}`, rejectBuy(s, 'C029_BeerTable'));
  } for (const decline of [false, true]) {
      const s = make('C029_BeerTable', st => { st.players[0]!.resources.grain = decline ? 1 : 0; }, true, 4), r = end(s, !decline, [], decline ? undefined : 'C029_BeerTable');
      resource(r, { grain: decline ? 1 : 0, food: 96 });
      resource(r, { food: 96 }, 1);
      assert.equal(bonus(r, 'C029_BeerTable'), 0);
      save(`C029-N2-${decline ? 'decline' : 'grain'}`, r);
  } });
  it("C029 N3 nonharvest held card and ordinary midround work cannot trade grain early", () => { for (const mode of ['nonharvest', 'hand', 'midround']) {
      const s = make('C029_BeerTable', st => { st.players[0]!.resources.grain = 1; }, mode !== 'hand', mode === 'hand' ? 4 : 5), r = mode === 'midround' ? finish(s, take(s, 0, 'forest'), true, [], 'C029_BeerTable') : end(s, true, [], 'C029_BeerTable');
      resource(r, { grain: 1, food: mode === 'hand' ? 96 : 100 });
      assert.equal(bonus(r, 'C029_BeerTable'), 0);
      save(`C029-N3-${mode}`, r);
  } });
})

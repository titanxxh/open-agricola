import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit35Harvest from './_helpers/audit/ae-negative-35-harvest'

describe('ae-negative-35-harvest', () => {
  const { sessions, save, ok, pendingCard, finish, action, progress, buy, bonus, milk } = audit35Harvest
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D038 N1 actual two occupation wood purchase and the real harvest field phase give the exact zero one two three four five cattle food thresholds before breeding', () => { const s = milk(1, false), bought = finish(s, buy(s, 'D038_MilkingStool')); assert.equal(bought.state.players[0]!.resources.wood, 0); const rows = []; for (const [n, gain, bred] of [[0, 0, 0], [1, 1, 1], [2, 1, 3], [3, 2, 4], [4, 2, 5], [5, 3, 6]] as const) {
      const t = milk(n), r = progress(t, 12);
      assert.equal(r.state.players[0]!.resources.food, 96 + gain);
      assert.equal(r.state.players[0]!.resources.cattle, bred);
      assert.equal(r.state.players[0]!.pastures[0]!.animalCount, bred);
      assert.equal(r.state.players[0]!.resources.begging, 0);
      rows.push(r);
  } save('D038-N1', { bought, rows }); });
  it('D038 N2 zero through six housed cattle score literal pair bonuses and a held card work action or nonharvest boundary cannot give milk', () => {
      const rows = [];
      for (const [n, expected] of [[0, 0], [1, 0], [2, 1], [3, 1], [4, 2], [5, 2], [6, 3]] as const) {
          const s = milk(n, true, 14), r = ok(s.getState());
          assert.equal(bonus(r, 'D038_MilkingStool'), expected);
          rows.push(r);
      }
      const t = milk(5, false, 14), held = ok(t.getState());
      assert.equal(bonus(held, 'D038_MilkingStool'), 0);
      const u = milk(1, true, 12), mid = action(u, 0, 'reed-bank'), next = progress(u, 13, 'D038_MilkingStool');
      assert.equal(mid.state.players[0]!.resources.food, 100);
      assert.equal(next.state.players[0]!.resources.food, 100);
      assert.equal(pendingCard(next, 'D038_MilkingStool'), false);
      save('D038-N2', { rows, held, mid, next });
  });
  it('D038 N3 a missing occupation or wood prevents purchase and actual one cattle milk supplies one surplus food after a four food feeding demand', () => { const rows = []; for (const [occupations, wood] of [[1, 1], [2, 0]] as const) {
      const s = milk(1, false, 11, occupations, wood), p = buy(s, 'D038_MilkingStool'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'D038_MilkingStool'));
      assert.ok(p.state.players[0]!.minorHand.includes('D038_MilkingStool'));
      rows.push({ p, bad });
  } const t = milk(1, false, 11, 2, 1, 4), bought = finish(t, buy(t, 'D038_MilkingStool')), r = progress(t, 12); assert.deepEqual([r.state.players[0]!.resources.food, r.state.players[0]!.resources.begging], [1, 0]); save('D038-N3', { rows, bought, r }); });
})

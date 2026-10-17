import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit38Cooking from './_helpers/audit/ae-negative-38-cooking'

describe('ae-negative-38-cooking', () => {
  const { sessions, save, make, finish, buy, printed, cook, bake, fondue } = audit38Cooking
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E057 N1 actual clay purchase and one grain baking give independent sheep cattle bonuses and no pig bonus', () => {
      const b = fondue(false), bought = finish(b, buy(b, 'E057_CheeseFondue'));
      assert.deepEqual([bought.state.players[0]!.resources.clay, printed(bought, 'E057_CheeseFondue')], [0, 1]);
      const rows = [];
      for (const [sheep, cattle, pig, food] of [[0, 0, 0, 102], [1, 0, 0, 103], [0, 1, 0, 103], [1, 1, 0, 104], [0, 0, 1, 102]] as const) {
          const s = fondue(true, sheep, cattle, pig), r = bake(s);
          assert.deepEqual([r.state.players[0]!.resources.grain, r.state.players[0]!.resources.food], [0, food]);
          rows.push(r);
      }
      save('E057-N1', { bought, rows });
  });
  it('E057 N2 baking two grain together gives only one bonus for each animal kind while held Fondue and no grain cannot reward an empty baking action', () => { const s = fondue(true, 1, 1, 0, 2), two = bake(s, 2); assert.equal(two.state.players[0]!.resources.food, 106); const t = fondue(false), hand = bake(t); assert.equal(hand.state.players[0]!.resources.food, 102); const q = fondue(true, 1, 1, 0, 0), p = q.takeAction(0, 'grain-utilization'); save('E057-N2-zero', p); const empty = p.ok ? finish(q, p) : p; save('E057-N2', { two, hand, p, empty }); assert.equal(empty.state.players[0]!.resources.food, 100); });
  it('E057 N3 missing clay cannot purchase and public anytime sheep cooking is not Bake Bread even with both housed animals', () => { const s = make('E057_CheeseFondue', false), p = buy(s, 'E057_CheeseFondue'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'E057_CheeseFondue')); const t = fondue(), anytime = cook(t, 'sheep'); assert.deepEqual([anytime.state.players[0]!.resources.grain, anytime.state.players[0]!.resources.food], [1, 102]); save('E057-N3', { p, bad, anytime }); });
})

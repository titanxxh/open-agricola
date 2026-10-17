import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit38Resources from './_helpers/audit/ae-negative-38-resources'

describe('ae-negative-38-resources', () => {
  const { sessions, save, pendingCard, finish, action, buy, printed, weir } = audit38Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E055 N1 actual two occupation one stone purchase and zero through five food Fishing piles give the literal additional general supply amounts', () => {
      const b = weir(false), bought = finish(b, buy(b, 'E055_StoneWeir'));
      assert.deepEqual([bought.state.players[0]!.resources.stone, printed(bought, 'E055_StoneWeir')], [0, 1]);
      const rows = [];
      for (const [pile, food] of [[0, 104], [1, 104], [2, 104], [3, 104], [4, 104], [5, 105]] as const) {
          const s = weir(true, pile), r = pile === 0 ? assertEmptyAccumulationRejected(s, 0, 'fishing') : action(s, 0, 'fishing');
          assert.equal(r.state.players[0]!.resources.food, pile === 0 ? 100 : food);
          assert.equal(r.state.actionSpaces.find(a => a.id === 'fishing')!.resources.food, 0);
          rows.push(r);
      }
      save('E055-N1', { bought, rows });
  });
  it('E055 N2 missing occupation or stone cannot buy and a held card Fishing only gives the actual pile', () => {
      const rows = [];
      for (const [occ, stone] of [[1, 1], [2, 0]] as const) {
          const s = weir(false, 2, occ, stone), p = buy(s, 'E055_StoneWeir'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'E055_StoneWeir'));
          rows.push({ p, bad });
      }
      const t = weir(false, 2), hand = action(t, 0, 'fishing');
      assert.equal(pendingCard(hand, 'E055_StoneWeir'), false);
      assert.equal(hand.state.players[0]!.resources.food, 102);
      save('E055-N2', { rows, hand });
  });
  it('E055 N3 unrelated accumulation and actual opponent Fishing do not give the owner any food', () => { const s = weir(), first = action(s, 0, 'reed-bank'), opponent = action(s, 1, 'fishing'); assert.equal(first.state.players[0]!.resources.food, 100); assert.deepEqual(opponent.state.players.map(p => p.resources.food), [100, 102]); save('E055-N3', { first, opponent }); });
})

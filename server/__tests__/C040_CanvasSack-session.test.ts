import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit35Resources from './_helpers/audit/ae-negative-35-resources'

describe('ae-negative-35-resources', () => {
  const { sessions, save, choose, finish, action, buy, printed, canvas } = audit35Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C040 N1 actual grain and reed alternatives each pay once and grant only their corresponding vegetable or four wood', () => {
      const rows = [];
      for (const kind of ['grain', 'reed'] as const) {
          const s = canvas(kind === 'grain' ? 1 : 0, kind === 'reed' ? 1 : 0), r = finish(s, buy(s, 'C040_CanvasSack'));
          assert.deepEqual([r.state.players[0]!.resources.grain, r.state.players[0]!.resources.reed, r.state.players[0]!.resources.vegetable, r.state.players[0]!.resources.wood], kind === 'grain' ? [0, 0, 1, 0] : [0, 0, 0, 4]);
          assert.equal(printed(r, 'C040_CanvasSack'), 1);
          rows.push(r);
      }
      save('C040-N1', rows);
  });
  it('C040 N2 when both alternative resources are present explicit payment pays only the chosen one and rejects an unavailable payment branch', () => {
      const rows = [];
      for (const kind of ['grain', 'reed'] as const) {
          const s = canvas(1, 1), p = buy(s, 'C040_CanvasSack');
          save('C040-N2-menu-' + kind, p);
          const bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'invalid-payment')), r = finish(s, choose(s, p, o => o.effectPreview !== undefined && 'resourcesPaid' in o.effectPreview && o.effectPreview.resourcesPaid?.[kind] === 1));
          assert.deepEqual([r.state.players[0]!.resources.grain, r.state.players[0]!.resources.reed, r.state.players[0]!.resources.vegetable, r.state.players[0]!.resources.wood], kind === 'grain' ? [0, 1, 1, 0] : [1, 0, 0, 4]);
          rows.push({ p, bad, r });
      }
      save('C040-N2', rows);
  });
  it('C040 N3 an occupation or no payment resources prevents purchase and a held card cannot gain its rewards on an unrelated action', () => {
      const rows = [];
      for (const [grain, reed, occ] of [[1, 1, 1], [0, 0, 0]] as const) {
          const s = canvas(grain, reed, occ), p = buy(s, 'C040_CanvasSack'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'C040_CanvasSack'));
          assert.ok(p.state.players[0]!.minorHand.includes('C040_CanvasSack'));
          assert.deepEqual([p.state.players[0]!.resources.wood, p.state.players[0]!.resources.vegetable], [0, 0]);
          rows.push({ p, bad });
      }
      const t = canvas(), hand = action(t, 0, 'reed-bank');
      assert.equal(hand.state.players[0]!.resources.vegetable, 0);
      save('C040-N3', { rows, hand });
  });
})

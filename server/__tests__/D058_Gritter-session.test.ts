import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit38Fields from './_helpers/audit/ae-negative-38-fields'

describe('ae-negative-38-fields', () => {
  const { sessions, save, ok, make, choose, pendingCard, finish, ready, action, buy, gritter, sowPending } = audit38Fields
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D058 N1 actual round five purchase and new vegetable sowing count existing and all newly sown vegetable fields exactly once', () => {
      const b = gritter(false, 5), bought = finish(b, buy(b, 'D058_Gritter'));
      assert.equal(bought.state.players[0]!.resources.wood, 0);
      const rows = [];
      for (const n of [1, 2] as const) {
          const s = gritter(true, 14, n), p = sowPending(s), r = finish(s, ok(s.commitSelectionChoice(0, { crops: Array.from({ length: n }, (_, i) => ({ row: 0, col: i + 2, crop: 'vegetable' })) })));
          assert.equal(r.state.players[0]!.resources.food, 101 + n);
          assert.equal(r.state.players[0]!.resources.vegetable, 0);
          assert.deepEqual(r.state.players[0]!.fields.slice(0, n + 1).map(f => f.stacks[0]!.remaining), n === 1 ? [1, 2] : [1, 2, 2]);
          rows.push({ p, r });
      }
      save('D058-N1', { bought, rows });
  });
  it('D058 N2 round four cannot buy and an occupied field or wrong actor rejects before one legal sow', () => { const q = gritter(false, 4), poor = buy(q, 'D058_Gritter'), early = assertRejectedUnchanged(q, () => q.resolveChoice(0, 'D058_Gritter')); const s = gritter(), p = sowPending(s), occupied = assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'vegetable' }] })), wrong = assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { crops: [{ row: 0, col: 2, crop: 'vegetable' }] })), r = finish(s, ok(s.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'vegetable' }] }))); assert.equal(r.state.players[0]!.resources.food, 102); save('D058-N2', { poor, early, p, occupied, wrong, r }); });
  it('D058 N3 grain only sowing and a held Gritter never gain food despite an existing vegetable field', () => {
      const rows = [];
      for (const [played, kind] of [[true, 'grain'], [false, 'vegetable']] as const) {
          const s = gritter(played, 14, kind === 'vegetable' ? 1 : 0, kind === 'grain' ? 1 : 0), p = sowPending(s), r = finish(s, ok(s.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: kind }] })));
          assert.equal(r.state.players[0]!.resources.food, 100);
          assert.equal(pendingCard(r, 'D058_Gritter'), false);
          rows.push({ p, r });
      }
      save('D058-N3', rows);
  });
  it('D058 N4 missing printed wood cannot buy and an actual opponent vegetable sow cannot reward the owner Gritter', () => { const s = make('D058_Gritter', false, state => { state.round = 5; }), p = buy(s, 'D058_Gritter'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'D058_Gritter')); const t = make('D058_Gritter', true, state => { state.players[1]!.resources.vegetable = 1; state.players[1]!.fields = [{ row: 0, col: 1, stacks: [] }]; }), first = action(t, 0, 'reed-bank'); ready(t); let q = ok(t.takeAction(1, 'grain-utilization')); if (q.interaction.stateId === 'wait' && q.interaction.request.kind === 'choice')
      q = choose(t, q, o => o.labelKey === 'actions.sow.name'); const r = finish(t, ok(t.commitSelectionChoice(1, { crops: [{ row: 0, col: 1, crop: 'vegetable' }] }))); assert.equal(r.state.players[0]!.resources.food, 100); assert.equal(r.state.players[1]!.resources.food, 100); save('D058-N4', { p, bad, first, q, r }); });
})

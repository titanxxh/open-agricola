import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit35Future from './_helpers/audit/ae-negative-35-future'

describe('ae-negative-35-future', () => {
  const { sessions, save, make, finish, progress, buy, OCC, future, delayed, schedule } = audit35Future
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D040 N1 actual two fields one occupation purchase schedules alternating clay pig and natural rounds deliver clay then a physically housed pig without an immediate reward', () => { const s = delayed('D040_Cesspit'), bought = finish(s, buy(s, 'D040_Cesspit')); assert.deepEqual(future(bought, 'D040_Cesspit'), schedule(5, ['clay', 'boar'])); assert.deepEqual([bought.state.players[0]!.resources.clay, bought.state.players[0]!.resources.boar], [0, 0]); const six = progress(s, 6), seven = progress(s, 7); assert.equal(six.state.players[0]!.resources.clay, 1); assert.deepEqual([seven.state.players[0]!.resources.clay, seven.state.players[0]!.resources.boar], [1, 1]); assert.equal(seven.state.players[0]!.pastures[0]!.animalCount, 1); assert.ok(seven.scores); assert.equal(seven.scores[0]!.categories.find(c => c.key === 'cards')!.entries.find(e => 'cardId' in e && e.cardId === 'D040_Cesspit')!.score, -1); save('D040-N1', { bought, six, seven }); });
  it('D040 N2 fewer fields or missing occupation cannot purchase and a held card produces no future goods at a real boundary', () => {
      const rows = [];
      for (const missing of ['field', 'occupation'] as const) {
          const s = make('D040_Cesspit', false, state => { state.round = 5; state.players[0]!.fields = [{ row: 0, col: 1, stacks: [] }, ...missing === 'occupation' ? [{ row: 0, col: 2, stacks: [] }] : []]; state.players[0]!.occupationPlayed = missing === 'occupation' ? [] : OCC.slice(0, 1); }), p = buy(s, 'D040_Cesspit'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'D040_Cesspit'));
          assert.deepEqual(future(p, 'D040_Cesspit'), []);
          rows.push({ p, bad });
      }
      const t = delayed('D040_Cesspit'), hand = progress(t, 6);
      assert.deepEqual([hand.state.players[0]!.resources.clay, hand.state.players[0]!.resources.boar], [0, 0]);
      save('D040-N2', { rows, hand });
  });
  it('D040 N3 late purchases truncate the alternating queue at round fourteen without clamping later pig goods', () => {
      const rows = [];
      for (const round of [12, 13, 14] as const) {
          const s = delayed('D040_Cesspit', round), r = finish(s, buy(s, 'D040_Cesspit'));
          assert.deepEqual(future(r, 'D040_Cesspit'), schedule(round, ['clay', 'boar']));
          rows.push(r);
      }
      save('D040-N3', rows);
  });
})

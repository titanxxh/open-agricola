import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit38Harvest from './_helpers/audit/ae-negative-38-harvest'

describe('ae-negative-38-harvest', () => {
  const { sessions, save, make, choose, pendingCard, trigger, finish, progress, buy, accept, QUIET, printed, exchangePay, studio } = audit38Harvest
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C055 N1 actual clay reed purchase and each real feeding exchange pays one wood clay or stone for exactly two two or three food', () => {
      const b = studio(false), bought = finish(b, buy(b, 'C055_Studio'));
      assert.deepEqual([bought.state.players[0]!.resources.clay, bought.state.players[0]!.resources.reed, printed(bought, 'C055_Studio')], [0, 0, 1]);
      const rows = [];
      for (const [kind, food] of [['wood', 98], ['clay', 98], ['stone', 99]] as const) {
          const s = studio(true, kind), p = progress(s, 12, 'C055_Studio', QUIET), chosen = exchangePay(s, p, 'C055_Studio', kind), r = finish(s, chosen);
          assert.deepEqual([r.state.players[0]!.resources[kind], r.state.players[0]!.resources.food], [0, food]);
          rows.push({ p, chosen, r });
      }
      save('C055-N1', { bought, rows });
  });
  it('C055 N2 actual decline preserves payment while held missing resources and a nonharvest work boundary cannot give exchange food', () => {
      const s = studio(), p = trigger(s, progress(s, 12, 'C055_Studio', QUIET), 'C055_Studio'), decline = finish(s, choose(s, p, o => o.value === '__skip__'));
      assert.deepEqual([decline.state.players[0]!.resources.wood, decline.state.players[0]!.resources.food], [1, 96]);
      const rows = [];
      for (const [played, n, round, food] of [[false, 1, 11, 96], [true, 0, 11, 96], [true, 1, 12, 100]] as const) {
          const t = studio(played, 'wood', n, 100, round), q = progress(t, round + 1, 'C055_Studio', QUIET), r = finish(t, pendingCard(q, 'C055_Studio') ? accept(t, q, 'C055_Studio') : q);
          assert.equal(r.state.players[0]!.resources.food, food);
          assert.equal(r.state.players[0]!.resources.wood, n);
          rows.push({ q, r });
      }
      save('C055-N2', { p, decline, rows });
  });
  it('C055 N3 wrong actor cannot choose a real Studio payment before legal retry and one stone exchange satisfies the actual four food feeding demand once', () => { const s = studio(true, 'stone', 2, 1), p = progress(s, 12, 'C055_Studio', QUIET), wrong = assertRejectedUnchanged(s, () => s.resolveChoice(1, 'not-owner')), r = finish(s, exchangePay(s, p, 'C055_Studio', 'stone')); assert.deepEqual([r.state.players[0]!.resources.stone, r.state.players[0]!.resources.food, r.state.players[0]!.resources.begging], [1, 0, 0]); assert.equal(pendingCard(r, 'C055_Studio'), false); save('C055-N3', { p, wrong, r }); });
  it('C055 N4 missing either printed clay or reed cannot buy Studio or award purchase food', () => { const rows = []; for (const kind of ['clay', 'reed'] as const) {
      const s = make('C055_Studio', false, state => { Object.assign(state.players[0]!.resources, { clay: kind === 'clay' ? 0 : 1, reed: kind === 'reed' ? 0 : 1 }); }), p = buy(s, 'C055_Studio'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'C055_Studio'));
      assert.equal(p.state.players[0]!.resources.food, 100);
      rows.push({ p, bad });
  } save('C055-N4', rows); });
})

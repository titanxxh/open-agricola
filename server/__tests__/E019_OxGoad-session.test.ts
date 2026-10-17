import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit32Crops from './_helpers/audit/ae-negative-32-crops'

describe('ae-negative-32-crops', () => {
  const { sessions, save, ok, choose, pendingCard, trigger, finish, action, buy, accept, ox } = audit32Crops
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E019 N1 actual prerequisite purchase pays wood and the legal Cattle Market houses cattle then pays two food to plow one field', () => { const b = ox(false), bought = finish(b, buy(b, 'E019_OxGoad')); assert.equal(bought.state.players[0]!.resources.wood, 0); const s = ox(), pending = finish(s, ok(s.takeAction(0, 'cattle-market')), 'E019_OxGoad'), p = accept(s, pending, 'E019_OxGoad'); assert.ok(p.interaction.stateId === 'wait' && p.interaction.request.kind === 'farm-select'); assert.equal(p.state.players[0]!.resources.food, 0); const bad = assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 1, col: 0 } })), r = finish(s, ok(s.commitSelectionChoice(0, { tile: { row: 0, col: 1 } }))); assert.deepEqual([r.state.players[0]!.resources.food, r.state.players[0]!.fields.length, r.state.players[0]!.resources.cattle], [0, 1, 1]); save('E019-N1', { bought, pending, p, bad, r }); });
  it('E019 N2 decline insufficient food and a held card never plow or spend the unpayable two food', () => { const rows = []; for (const [played, food, decline] of [[true, 2, true], [true, 1, false], [false, 2, false]] as const) {
      const s = ox(played, food);
      let p = finish(s, ok(s.takeAction(0, 'cattle-market')), 'E019_OxGoad');
      if (pendingCard(p, 'E019_OxGoad')) {
          p = trigger(s, p, 'E019_OxGoad');
          p = decline ? choose(s, p, o => o.value === '__skip__') : accept(s, p, 'E019_OxGoad');
      }
      const r = finish(s, p);
      assert.deepEqual([r.state.players[0]!.resources.food, r.state.players[0]!.fields.length], [food, 0]);
      rows.push(r);
  } save('E019-N2', rows); });
  it('E019 N3 two occupations cannot buy and an actual opponent Cattle Market does not plow for the owner', () => { const s = ox(false, 2, 2), poor = buy(s, 'E019_OxGoad'); assert.ok(poor.state.players[0]!.minorHand.includes('E019_OxGoad')); assertRejectedUnchanged(s, () => s.resolveChoice(0, 'E019_OxGoad')); const t = ox(), first = action(t, 0, 'grain-seeds'), r = action(t, 1, 'cattle-market'); assert.equal(r.state.players[0]!.fields.length, 0); assert.equal(r.state.players[0]!.resources.food, 2); save('E019-N3', { poor, first, r }); });
})

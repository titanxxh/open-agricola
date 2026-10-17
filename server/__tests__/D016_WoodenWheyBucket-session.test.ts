import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit29Farm from './_helpers/audit/ae-negative-29-farm'

describe('ae-negative-29-farm', () => {
  const { sessions, save, ok, finish, action, choose, buy, accept, bucket } = audit29Farm
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D016 N1 actual purchase pays wood and food and legal Sheep and Cattle markets build one stable before housing at the printed different costs', () => { const bought = buy(bucket(false), 'D016_WoodenWheyBucket'); assert.deepEqual([bought.state.players[0]!.resources.wood, bought.state.players[0]!.resources.food], [0, 0]); const rows = []; for (const [space, wood, animal] of [['sheep-market', 1, 'sheep'], ['cattle-market', 0, 'cattle']] as const) {
      const s = bucket(true, wood, space), p = accept(s, ok(s.takeAction(0, space)));
      assert.ok(p.interaction.stateId === 'wait' && p.interaction.request.kind === 'farm-select');
      assert.equal(p.state.players[0]!.resources[animal], 0);
      const r = finish(s, ok(s.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] })));
      assert.deepEqual([r.state.players[0]!.stableTiles.length, r.state.players[0]!.resources.wood, r.state.players[0]!.resources[animal]], [1, 0, 1]);
      assert.equal(Object.values(r.state.players[0]!.stableAnimals).filter(t => t.animalType === animal).length, 1);
      rows.push({ p, r });
  } save('D016-N1', { bought, rows }); });
  it('D016 N2 two stable submission rejects and one stable retries while optional decline preserves wood', () => { const s = bucket(), p = accept(s, ok(s.takeAction(0, 'sheep-market'))), bad = assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }, { row: 0, col: 2 }] })), r = finish(s, ok(s.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] }))); assert.equal(r.state.players[0]!.stableTiles.length, 1); const t = bucket(), pending = ok(t.takeAction(0, 'sheep-market')), decline = finish(t, choose(t, pending, o => o.value === '__skip__')); assert.deepEqual([decline.state.players[0]!.stableTiles.length, decline.state.players[0]!.resources.wood], [0, 1]); save('D016-N2', { p, bad, r, pending, decline }); });
  it('D016 N3 no Sheep payment no stable supply held card opponent market and Pig Market never build an extra stable', () => { const rows = []; for (const [played, wood, market, full] of [[true, 0, 'sheep-market', false], [true, 1, 'sheep-market', true], [false, 1, 'sheep-market', false], [true, 1, 'pig-market', false]] as const) {
      const s = bucket(played, wood, market, full), r = action(s, 0, market);
      assert.equal(r.state.players[0]!.stableTiles.length, full ? 4 : 0);
      assert.equal(r.state.players[0]!.resources.wood, wood);
      rows.push(r);
  } const s = bucket(), first = action(s, 0, 'grain-seeds'), opponent = action(s, 1, 'sheep-market'); assert.equal(opponent.state.players[0]!.stableTiles.length, 0); assert.equal(opponent.state.players[1]!.stableTiles.length, 0); save('D016-N3', { rows, first, opponent }); });
})

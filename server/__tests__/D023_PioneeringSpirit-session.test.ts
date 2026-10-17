import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { takeNormalWorkerTurn } from './_helpers/supply-worker-turn'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit32Supply from './_helpers/audit/ae-negative-32-supply'

describe('ae-negative-32-supply', () => {
  const { sessions, save, ok, choose, finish, ready, action, buy, pioneer, created } = audit32Supply
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D023 N1 actual creation before use permits a round four private renovation at its full room cost', () => { const s = pioneer(4), bought = created(s), r = finish(s, ok(s.takeAction(0, 'D023_PioneeringSpirit'))); assert.deepEqual([r.state.players[0]!.houseType, r.state.players[0]!.resources.clay, r.state.players[0]!.resources.reed], ['clay', 0, 0]); save('D023-N1', { bought, r }); });
  it('D023 N2 rounds six and eight select exactly one vegetable pig or cattle and wrong grain rejects before legal selection', () => { const rows = []; for (const [round, good] of [[6, 'vegetable'], [6, 'boar'], [8, 'cattle']] as const) {
      const s = pioneer(round), bought = created(s), p = ok(s.takeAction(0, 'D023_PioneeringSpirit')), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'grain')), r = finish(s, choose(s, p, o => o.labelKey === `resources.${good}`));
      assert.equal(r.state.players[0]!.resources[good], 1);
      if (good !== 'vegetable')
          assert.equal(Object.values(r.state.players[0]!.houseAnimals).filter(t => t === good).length, 1);
      rows.push({ bought, p, bad, r });
  } save('D023-N2', rows); });
  it('D023 N3 private ownership and occupancy reject actual opponent use and a second same round placement before an ordinary legal retry', () => { const s = pioneer(6, 3), bought = finish(s, buy(s, 'D023_PioneeringSpirit')); ready(s); const opponent = assertRejectedUnchanged(s, () => s.takeAction(1, 'D023_PioneeringSpirit')); action(s, 1, 'forest'); ready(s); const p = ok(s.takeAction(0, 'D023_PioneeringSpirit')), r = finish(s, choose(s, p, o => o.labelKey === 'resources.vegetable')); action(s, 1, 'grain-seeds'); ready(s); const occupied = assertRejectedUnchanged(s, () => s.takeAction(0, 'D023_PioneeringSpirit')), retry = finish(s, ok(takeNormalWorkerTurn(s, 'reed-bank'))); assert.equal(retry.state.players[0]!.resources.vegetable, 1); save('D023-N3', { bought, opponent, p, r, occupied, retry }); });
  it('D023 N4 purchase outside the active range still creates the card but rounds two and nine and an unplayed card cannot use its action', () => { const rows = []; for (const round of [2, 9]) {
      const s = pioneer(round), bought = created(s), bad = assertRejectedUnchanged(s, () => s.takeAction(0, 'D023_PioneeringSpirit')), r = finish(s, ok(takeNormalWorkerTurn(s, 'reed-bank')));
      assert.equal(r.state.players[0]!.resources.vegetable, 0);
      rows.push({ bought, bad, r });
  } const t = pioneer(), hand = assertRejectedUnchanged(t, () => t.takeAction(0, 'D023_PioneeringSpirit')); save('D023-N4', { rows, hand }); });
})

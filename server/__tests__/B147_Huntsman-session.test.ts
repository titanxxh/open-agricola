import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit29Exchanges from './_helpers/audit/ae-negative-29-exchanges'

describe('ae-negative-29-exchanges', () => {
  const { sessions, save, ok, finish, action, pending, choose, huntsman } = audit29Exchanges
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('B147 N1 actual paid grain gives one housed pig only after taking the wood', () => { const s = huntsman(), p = pending(s, ok(s.takeAction(0, 'forest')), 'B147_Huntsman'); assert.equal(p.state.players[0]!.resources.wood, 3); const r = finish(s, choose(s, p, o => o.value !== '__skip__')); assert.deepEqual([r.state.players[0]!.resources.grain, r.state.players[0]!.resources.boar], [0, 1]); assert.equal(Object.values(r.state.players[0]!.houseAnimals ?? {}).filter(t => t === 'boar').length, 1); save('B147-N1', { p, r }); });
  it('B147 N2 decline missing grain held card and opponent or nonwood action cannot give a free pig', () => { const s = huntsman(), p = pending(s, ok(s.takeAction(0, 'forest')), 'B147_Huntsman'), decline = finish(s, choose(s, p, o => o.value === '__skip__')); assert.deepEqual([decline.state.players[0]!.resources.grain, decline.state.players[0]!.resources.boar], [1, 0]); const results = []; for (const [played, grain, space] of [[true, 0, 'forest'], [false, 1, 'forest'], [true, 1, 'reed-bank']] as const) {
      const t = huntsman(played, grain), r = action(t, 0, space);
      assert.equal(r.state.players[0]!.resources.boar, 0);
      assert.equal(r.state.players[0]!.resources.grain, grain);
      results.push(r);
  } const q = huntsman(), first = action(q, 0, 'grain-seeds'), opponent = action(q, 1, 'forest'); assert.equal(opponent.state.players[0]!.resources.boar, 0); assert.equal(opponent.state.players[1]!.resources.boar, 0); save('B147-N2', { p, decline, results, first, opponent }); });
})

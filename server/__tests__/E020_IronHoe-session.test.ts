import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit32Crops from './_helpers/audit/ae-negative-32-crops'

describe('ae-negative-32-crops', () => {
  const { sessions, save, ok, choose, pendingCard, trigger, finish, progress, buy, accept, hoe, seeds } = audit32Crops
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E020 N1 actual purchase pays one wood and real ownership of both seed spaces permits exactly one end of work plow', () => { const s = hoe(false), bought = finish(s, buy(s, 'E020_IronHoe')); assert.equal(bought.state.players[0]!.resources.wood, 0); const t = hoe(), steps = seeds(t); assert.equal(steps.third.state.players[0]!.fields.length, 0); const p = accept(t, progress(t, 15, 'E020_IronHoe'), 'E020_IronHoe'); assert.ok(p.interaction.stateId === 'wait' && p.interaction.request.kind === 'farm-select'); const r = finish(t, ok(t.commitSelectionChoice(0, { tile: { row: 0, col: 1 } }))); assert.equal(r.state.players[0]!.fields.length, 1); save('E020-N1', { bought, steps, p, r }); });
  it('E020 N2 a declined end of work plow leaves the farm unchanged', () => { const s = hoe(), steps = seeds(s), p = trigger(s, progress(s, 15, 'E020_IronHoe'), 'E020_IronHoe'), r = finish(s, choose(s, p, o => o.value === '__skip__')); assert.equal(r.state.players[0]!.fields.length, 0); save('E020-N2', { steps, p, r }); });
  it('E020 N3 one seed space split ownership and a held card cannot grant an end of work field', () => { const rows = []; for (const [played, split] of [[true, false], [true, true], [false, false]] as const) {
      const s = hoe(played), steps = seeds(s, !played, split), r = progress(s, 15, 'E020_IronHoe');
      assert.equal(pendingCard(r, 'E020_IronHoe'), false);
      assert.equal(r.state.players[0]!.fields.length, 0);
      rows.push({ steps, r });
  } save('E020-N3', rows); });
})

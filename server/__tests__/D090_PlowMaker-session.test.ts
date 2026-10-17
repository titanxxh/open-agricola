import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit44Cards from './_helpers/audit/ae-negative-44-cards'

describe('ae-negative-44-cards', () => {
  const { sessions, save, ok, make, finish, ready } = audit44Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D090 N1 Farmland and Cultivation each pay one food for exactly two fields', () => { for (const space of ['farmland', 'cultivation']) { const s = make('D090_PlowMaker', undefined, true, 14), r = finish(s, ok(s.takeAction(0, space))); assert.equal(r.state.players[0]!.fields.length, 2); assert.equal(r.state.players[0]!.resources.food, 99); save(`D090-N1-${space}`, r) } })
  it('D090 N2 decline or zero food gives one ordinary field and unrelated Grain Seeds gives none', () => { const s = make('D090_PlowMaker'), r = finish(s, ok(s.takeAction(0, 'farmland')), false); assert.equal(r.state.players[0]!.fields.length, 1); assert.equal(r.state.players[0]!.resources.food, 100); const c = make('D090_PlowMaker', st => { st.players[0]!.resources.food = 0 }), cr = finish(c, ok(c.takeAction(0, 'farmland')), false); assert.equal(cr.state.players[0]!.fields.length, 1); assert.equal(cr.state.players[0]!.resources.food, 0); const d = make('D090_PlowMaker'), dr = finish(d, ok(d.takeAction(0, 'grain-seeds'))); assert.equal(dr.state.players[0]!.fields.length, 0); assert.equal(dr.state.players[0]!.resources.food, 100); save('D090-N2', { r, cr, dr }) })
  it('D090 N3 genuine second placement still grants paid extra field', () => { const s = make('D090_PlowMaker'); finish(s, ok(s.takeAction(0, 'grain-seeds')), false); ready(s); finish(s, ok(s.takeAction(1, 'day-laborer')), false); ready(s); const r = finish(s, ok(s.takeAction(0, 'farmland'))); assert.equal(r.state.players[0]!.fields.length, 2); assert.equal(r.state.players[0]!.resources.food, 99); save('D090-N3', r) })
})

import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit44Cards from './_helpers/audit/ae-negative-44-cards'

describe('ae-negative-44-cards', () => {
  const { sessions, save, ok, make, finish, ready } = audit44Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C091 N1 first Farmland and Cultivation each pay one food for exactly two fields', () => { for (const space of ['farmland', 'cultivation']) { const s = make('C091_PlowHero', undefined, true, 14), r = finish(s, ok(s.takeAction(0, space))); assert.equal(r.state.players[0]!.fields.length, 2); assert.equal(r.state.players[0]!.resources.food, 99); assert.equal(r.state.players[1]!.fields.length, 0); save(`C091-N1-${space}`, r) } })
  it('C091 N2 declining or zero food leaves exactly the ordinary field and no food charge', () => { const s = make('C091_PlowHero'), r = finish(s, ok(s.takeAction(0, 'farmland')), false); assert.equal(r.state.players[0]!.fields.length, 1); assert.equal(r.state.players[0]!.resources.food, 100); const c = make('C091_PlowHero', st => { st.players[0]!.resources.food = 0 }), cr = finish(c, ok(c.takeAction(0, 'farmland')), false); assert.equal(cr.state.players[0]!.fields.length, 1); assert.equal(cr.state.players[0]!.resources.food, 0); save('C091-N2', { r, cr }) })
  it('C091 N3 genuine second placement on Farmland cannot trigger after Grain Seeds and opponent Day Laborer', () => { const s = make('C091_PlowHero'); finish(s, ok(s.takeAction(0, 'grain-seeds')), false); ready(s); assert.equal(s.state.currentPlayerIndex, 1); finish(s, ok(s.takeAction(1, 'day-laborer')), false); ready(s); assert.equal(s.state.currentPlayerIndex, 0); const r = finish(s, ok(s.takeAction(0, 'farmland'))); assert.equal(r.state.players[0]!.fields.length, 1); assert.equal(r.state.players[0]!.resources.food, 100); assert.equal(r.state.players[0]!.resources.grain, 1); save('C091-N3', r) })
})

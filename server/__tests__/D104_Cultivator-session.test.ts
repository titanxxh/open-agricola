import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit47Cards from './_helpers/audit/ae-negative-47-cards'

describe('ae-negative-47-cards', () => {
  const { sessions, save, ok, make, finish, ready } = audit47Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D104 N1 one real new field gains one wood and food while two paid Plow Maker fields gain twice', () => { const s = make('D104_Cultivator'), r = finish(s, ok(s.takeAction(0, 'farmland'))); assert.equal(r.state.players[0]!.fields.length, 1); assert.equal(r.state.players[0]!.resources.wood, 1); assert.equal(r.state.players[0]!.resources.food, 101); const c = make('D104_Cultivator', st => { st.players[0]!.occupationPlayed.push('D090_PlowMaker') }), cr = finish(c, ok(c.takeAction(0, 'farmland'))); assert.equal(cr.state.players[0]!.fields.length, 2); assert.equal(cr.state.players[0]!.resources.wood, 2); assert.equal(cr.state.players[0]!.resources.food, 101); save('D104-N1', { r, cr }) })
  it('D104 N2 nonplowing owner action and actual opponent plow cannot grant owner reward', () => { const s = make('D104_Cultivator'), a = finish(s, ok(s.takeAction(0, 'grain-seeds')), false); ready(s); const r = finish(s, ok(s.takeAction(1, 'farmland'))); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.food, 100); assert.equal(r.state.players[1]!.fields.length, 1); assert.equal(r.state.players[1]!.resources.wood, 0); save('D104-N2', { a, r }) })
})

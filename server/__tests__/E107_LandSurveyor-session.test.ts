import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit47Cards from './_helpers/audit/ae-negative-47-cards'

describe('ae-negative-47-cards', () => {
  const { sessions, save, ok, make, finish, end, fields } = audit47Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E107 N1 real harvest field thresholds zero one two three four five six seven yield exactly zero zero one one two two three four food', () => { for (const count of [0, 1, 2, 3, 4, 5, 6, 7]) { const s = make('E107_LandSurveyor', st => fields(st, count), true, 4), r = finish(s, end(s), false); assert.equal(r.state.players[0]!.resources.food, 96 + [0, 0, 1, 1, 2, 2, 3, 4][count]!); assert.equal(r.state.players[0]!.fields.length, count); save(`E107-N1-${count}`, r) } })
  it('E107 N2 fields in work phase cannot grant harvest food and card in hand cannot reward field phase', () => { const s = make('E107_LandSurveyor', st => fields(st, 7)), r = finish(s, ok(s.takeAction(0, 'grain-seeds')), false); assert.equal(r.state.players[0]!.resources.food, 100); const c = make('E107_LandSurveyor', st => fields(st, 7), false, 4), cr = finish(c, end(c), false); assert.equal(cr.state.players[0]!.resources.food, 96); save('E107-N2', { r, cr }) })
})

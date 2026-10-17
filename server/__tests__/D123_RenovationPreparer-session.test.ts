import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit50Cards from './_helpers/audit/ae-negative-50-cards'

describe('ae-negative-50-cards', () => {
  const { sessions, save, ok, make, finish, ready, resources, rooms, build } = audit50Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D123 N1 one or two real wood rooms grant two clay each and a clay room grants two stone', () => { for (const [house, count, reward] of [['wood', 1, 'clay'], ['wood', 2, 'clay'], ['clay', 1, 'stone']] as const) { const s = make('D123_RenovationPreparer', st => { rooms(st, 2, house); Object.assign(st.players[0]!.resources, { [house]: 5 * count, reed: 2 * count }) }), r = build(s, count); resources(r, { [house]: 0, reed: 0, [reward]: 2 * count }); assert.equal(r.state.players[0]!.rooms, 2 + count); save(`D123-N1-${house}-${count}`, r) } })
  it('D123 N2 stone room stable-only and actual opponent wood room give owner no preparer reward', () => { const s = make('D123_RenovationPreparer', st => { rooms(st, 2, 'stone'); Object.assign(st.players[0]!.resources, { stone: 5, reed: 2 }) }), r = build(s); resources(r, { clay: 0, stone: 0 }); const c = make('D123_RenovationPreparer', st => { st.players[0]!.resources.wood = 2 }), cr = build(c, 1, 'stable'); resources(cr, { clay: 0, stone: 0 }); assert.equal(cr.state.players[0]!.stableTiles.length, 1); const a = make('D123_RenovationPreparer', st => Object.assign(st.players[1]!.resources, { wood: 5, reed: 2 })); finish(a, ok(a.takeAction(0, 'grain-seeds')), false); ready(a); const ar = build(a); resources(ar, { clay: 0, stone: 0 }); assert.equal(ar.state.players[1]!.rooms, 3); save('D123-N2', { r, cr, ar }) })
})

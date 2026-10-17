import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit47Cards from './_helpers/audit/ae-negative-47-cards'

describe('ae-negative-47-cards', () => {
  const { sessions, save, make, finish, lesson, sell } = audit47Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E106 N1 actual Lessons sells each building resource for exact wood clay two or reed stone three food', () => { for (const [resource, food] of [['wood', 2], ['clay', 2], ['reed', 3], ['stone', 3]] as const) { const s = make('E106_EmergencySeller', st => { st.players[0]!.resources[resource] = 1 }, false), r = sell(s, lesson(s, 'E106_EmergencySeller'), [resource]); assert.equal(r.state.players[0]!.resources[resource], 0); assert.equal(r.state.players[0]!.resources.food, 100 + food); save(`E106-N1-${resource}`, r) } })
  it('E106 N2 two-person sale stops after two resources and decline preserves all resources', () => { const s = make('E106_EmergencySeller', st => Object.assign(st.players[0]!.resources, { wood: 1, clay: 1, reed: 1 }), false), p = lesson(s, 'E106_EmergencySeller'), rejected = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'sell-food')), r = sell(s, p, ['wood', 'clay']); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.clay, 0); assert.equal(r.state.players[0]!.resources.reed, 1); assert.equal(r.state.players[0]!.resources.food, 104); const c = make('E106_EmergencySeller', st => Object.assign(st.players[0]!.resources, { wood: 1, stone: 1 }), false), cr = finish(c, lesson(c, 'E106_EmergencySeller'), false); assert.equal(cr.state.players[0]!.resources.wood, 1); assert.equal(cr.state.players[0]!.resources.stone, 1); assert.equal(cr.state.players[0]!.resources.food, 100); save('E106-N2', { p, rejected, r, cr }) })
})

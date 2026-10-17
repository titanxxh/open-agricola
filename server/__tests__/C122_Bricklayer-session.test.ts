import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit50Cards from './_helpers/audit/ae-negative-50-cards'

describe('ae-negative-50-cards', () => {
  const { sessions, save, ok, make, finish, resources, rooms, build, improvement } = audit50Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C122 N1 real major and minor improvements each discount one clay with a zero floor', () => { const s = make('C122_Bricklayer', st => { st.players[0]!.resources.clay = 1; st.availableMajorImprovements = ['Major_Fireplace1'] }), r = finish(s, improvement(s)); resources(r, { clay: 0 }); assert.ok(r.state.players[0]!.improvements.includes('Major_Fireplace1')); const c = make('C122_Bricklayer', st => { st.players[0]!.minorHand = ['A050_MilkJug'] }), cr = finish(c, improvement(c, 'A050_MilkJug')); resources(cr, { clay: 0, wood: 0 }); assert.ok(cr.state.players[0]!.minorPlayed.includes('A050_MilkJug')); save('C122-N1', { r, cr }) })
  it('C122 N2 a clay room discounts two clay and a renovation discounts one clay', () => { const s = make('C122_Bricklayer', st => { rooms(st, 2, 'clay'); Object.assign(st.players[0]!.resources, { clay: 3, reed: 2 }) }), r = build(s); resources(r, { clay: 0, reed: 0 }); assert.equal(r.state.players[0]!.rooms, 3); const c = make('C122_Bricklayer', st => Object.assign(st.players[0]!.resources, { clay: 1, reed: 1 }), true, 14), cr = finish(c, ok(c.takeAction(0, 'house-redevelopment')), false); resources(cr, { clay: 0, reed: 0 }); assert.equal(cr.state.players[0]!.houseType, 'clay'); save('C122-N2', { r, cr }) })
  it('C122 N3 unplayed Bricklayer cannot fund Fireplace while a wood room keeps exact normal cost', () => { const s = make('C122_Bricklayer', st => { st.players[0]!.resources.clay = 1; st.availableMajorImprovements = ['Major_Fireplace1'] }, false), rejected = assertRejectedUnchanged(s, () => s.takeAction(0, 'major-improvement')), r = finish(s, ok(s.takeAction(0, 'grain-seeds'))); resources(r, { clay: 1, grain: 1 }); const c = make('C122_Bricklayer', st => Object.assign(st.players[0]!.resources, { wood: 5, reed: 2 })), cr = build(c); resources(cr, { wood: 0, reed: 0, clay: 0 }); assert.equal(cr.state.players[0]!.rooms, 3); save('C122-N3', { rejected, r, cr }) })
})

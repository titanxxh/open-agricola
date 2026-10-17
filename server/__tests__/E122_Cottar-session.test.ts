import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit50Cards from './_helpers/audit/ae-negative-50-cards'

describe('ae-negative-50-cards', () => {
  const { sessions, save, ok, make, finish, lesson, resources, improvement, gainChoice } = audit50Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E122 N1 real Fireplace cost is paid before wood or clay reward is selected', () => { for (const resource of ['wood', 'clay'] as const) { const s = make('E122_Cottar', st => { st.players[0]!.resources.clay = 2; st.availableMajorImprovements = ['Major_Fireplace1'] }), p = improvement(s); resources(p, { clay: 0 }); const r = gainChoice(s, p, 'E122_Cottar', resource); resources(r, { wood: resource === 'wood' ? 1 : 0, clay: resource === 'clay' ? 1 : 0 }); assert.ok(r.state.players[0]!.improvements.includes('Major_Fireplace1')); save(`E122-N1-${resource}`, { p, r }) } })
  it('E122 N2 real minor Milk Jug pays one clay and grants selected wood', () => { const s = make('E122_Cottar', st => { st.players[0]!.resources.clay = 1; st.players[0]!.minorHand = ['A050_MilkJug'] }), p = improvement(s, 'A050_MilkJug'), r = gainChoice(s, p, 'E122_Cottar', 'wood'); resources(r, { clay: 0, wood: 1 }); assert.ok(r.state.players[0]!.minorPlayed.includes('A050_MilkJug')); save('E122-N2', { p, r }) })
  it('E122 N3 future clay reward cannot fund an unaffordable improvement and occupation payment cannot reward Cottar', () => { const s = make('E122_Cottar', st => { st.players[0]!.resources.clay = 1; st.availableMajorImprovements = ['Major_Fireplace1'] }), rejected = assertRejectedUnchanged(s, () => s.takeAction(0, 'major-improvement')), r = finish(s, ok(s.takeAction(0, 'grain-seeds'))); resources(r, { clay: 1, wood: 0 }); const c = make('E122_Cottar', st => { st.players[0]!.occupationHand = ['A095_Angler'] }), cr = finish(c, lesson(c, 'A095_Angler')); resources(cr, { wood: 0, clay: 0, food: 99 }); save('E122-N3', { rejected, r, cr }) })
})

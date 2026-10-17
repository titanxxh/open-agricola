import assert from 'node:assert/strict'
import { writeFileSync } from './_helpers/audit-evidence-fs'
import { afterAll, afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged, assertRuleOutcome, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit11Growth from './_helpers/audit/ae-negative-11-growth'

describe('ae-negative-11-growth', () => {
  const { BED, WAGE, sessions, directory, evidence, record, rooms, setup, finish, turn, values, build, bed, nextRound } = audit11Growth
  afterAll(() => writeFileSync(`${directory}/native-responses.json`, JSON.stringify(evidence, null, 2)))
  afterEach(context => sessions.splice(0).forEach(s => { record(`test-final:${context.task.name}`, s.getState()); s.dispose() }))
  it('A093 N1 actual room payment then one wood and grain grants one newborn without a minor purchase', () => { const s = setup(BED, { resources: { wood: 6, reed: 2, grain: 1 } }); const r = bed(s); assert.deepEqual(values(r), { rooms: 3, family: 3, newborns: 1, wood: 0, reed: 0, grain: 0, food: 30 }); assert(r.state.players[0]!.minorHand.includes(WAGE)) })
  it('A093 N2 no grain preserves remaining wood and cannot create a child', () => { const s = setup(BED, { resources: { wood: 6, reed: 2 } }); const r = finish(s, build(s)); assert.deepEqual(values(r), { rooms: 3, family: 2, newborns: 0, wood: 1, reed: 0, grain: 0, food: 30 }) })
  it('A093 N3 no wood after room construction preserves grain and creates no child', () => { const s = setup(BED, { resources: { wood: 5, reed: 2, grain: 1 } }); const r = finish(s, build(s)); assert.deepEqual(values(r), { rooms: 3, family: 2, newborns: 0, wood: 0, reed: 0, grain: 1, food: 30 }) })
  it('A093 N4 two rooms in one actual action grant exactly one growth and one extra fee', () => { const s = setup(BED, { resources: { wood: 11, reed: 4, grain: 1 } }); const r = bed(s, [rooms[2]!, rooms[3]!]); assert.deepEqual(values(r), { rooms: 4, family: 3, newborns: 1, wood: 0, reed: 0, grain: 0, food: 30 }); assert(r.state.players[0]!.minorHand.includes(WAGE)) })
  it('A093 N5 declining keeps the new room and both extra-fee resources', () => { const s = setup(BED, { resources: { wood: 6, reed: 2, grain: 1 } }); const r = bed(s, [rooms[2]!], false); assert.deepEqual(values(r), { rooms: 3, family: 2, newborns: 0, wood: 1, reed: 0, grain: 1, food: 30 }) })
  it('A093 N6 five physical active family members prevent a sixth birth and extra charge', () => { const s = setup(BED, { roomCount: 5, people: 5, resources: { wood: 6, reed: 2, grain: 1 } }); const r = finish(s, build(s, [rooms[5]!])); assertRuleOutcome(values(r), { rooms: 6, family: 5, newborns: 0, wood: 1, reed: 0, grain: 1, food: 30 }) })
  it('A093 N7 card in hand does not reward actual room construction', () => { const s = setup(BED, { played: false, resources: { wood: 6, reed: 2, grain: 1 } }); const r = finish(s, build(s)); assert.deepEqual(values(r), { rooms: 3, family: 2, newborns: 0, wood: 1, reed: 0, grain: 1, food: 30 }) })
  it('A093 N8 real opponent construction cannot spend owner fee or give owner a child', () => { const s = setup(BED, { resources: { wood: 1, grain: 1 } }, st => Object.assign(st.players[1]!.resources, { wood: 5, reed: 2 })); turn(s, 0, 'grain-seeds'); const r = finish(s, build(s, [rooms[2]!], 1), 1); assert.equal(r.state.players[1]!.rooms, 3); assert.equal(values(r).family, 2); assert.equal(values(r).wood, 1); assert.equal(values(r).grain, 2) })
  it('A093 N9 stable-only construction does not grant growth or spend its fee', () => { const s = setup(BED, { resources: { wood: 3, grain: 1 } }); const r = finish(s, build(s, [{ row: 0, col: 1 }], 0, true)); assert.equal(r.state.players[0]!.stableTiles.length, 1); assert.equal(values(r).family, 2); assert.equal(values(r).wood, 1); assert.equal(values(r).grain, 1) })
  it('A093 N10 whole build fee and newborn undo restores all state before an exact retry', () => { const s = setup(BED, { resources: { wood: 6, reed: 2, grain: 1 } }); const before = undoRuleSnapshot(s.getState()); bed(s); assertUndoRestored(before, record('undo-bedmaker', s.undoAction())); const r = bed(s); assert.equal(values(r).family, 3); assert.equal(values(r).wood, 0); record('stale-bed', assertRejectedUnchanged(s, () => s.resolveChoice(0, 'family-growth'))) })
  it('A093 N11 a different room build after a natural next round offers growth again after an earlier decline', () => {
    const s = setup(BED, { resources: { wood: 11, reed: 4, grain: 1 } }); bed(s, [rooms[2]!], false)
    turn(s, 1, 'forest'); turn(s, 0, 'reed-bank'); nextRound(s, turn(s, 1, 'clay-pit'))
    const r = bed(s, [rooms[3]!]); assert.equal(values(r).rooms, 4); assert.equal(values(r).family, 3); assert.equal(values(r).newborns, 1); assert.equal(values(r).wood, 0); assert.equal(values(r).grain, 0)
  })
})

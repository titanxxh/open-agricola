import assert from 'node:assert/strict'
import { writeFileSync } from './_helpers/audit-evidence-fs'
import { afterAll, afterEach, it, describe } from 'vitest'
import { familySize, newbornCount, workersAvailable } from '../../shared/domain/player'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit11Growth from './_helpers/audit/ae-negative-11-growth'

describe('ae-negative-11-growth', () => {
  const { PARENTS, BED, ANY, sessions, directory, evidence, record, ok, rooms, setup, options, ready, turn, growth, values, bed, lastOrdinary, nextRound } = audit11Growth
  afterAll(() => writeFileSync(`${directory}/native-responses.json`, JSON.stringify(evidence, null, 2)))
  afterEach(context => sessions.splice(0).forEach(s => { record(`test-final:${context.task.name}`, s.getState()); s.dispose() }))
  it('A092 N1 real newborn promotion pays one food and preserves opponent alternation', () => { const s = setup(PARENTS, { roomCount: 3, resources: { food: 1 } }); growth(s); assert.equal(newbornCount(s.state.players[0]!), 1); const r = record('promote', ok(s.takeAnytimeAction(0, ANY))); assert.equal(values(r).food, 0); assert.equal(values(r).family, 3); assert.equal(values(r).newborns, 0); ready(s, 1); assert.equal(workersAvailable(s.state, s.state.players[0]!), 2); turn(s, 1, 'forest'); turn(s, 0, 'reed-bank'); assert.equal(workersAvailable(s.state, s.state.players[0]!), 1); record('duplicate-no-newborn', assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, ANY))) })
  it('A092 N2 actual newborn with zero own food cannot use opponents food', () => { const s = setup(PARENTS, { roomCount: 3, resources: { food: 0 } }); growth(s); record('no-food', assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, ANY))); assert.equal(newbornCount(s.state.players[0]!), 1); assert.equal(values(s.getState()).food, 0) })
  it('A092 N3 unplayed Parents cannot activate a real newborn', () => { const s = setup(PARENTS, { played: false, roomCount: 3, resources: { food: 1 } }); growth(s); record('unplayed-parents', assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, ANY))); assert.equal(newbornCount(s.state.players[0]!), 1); assert.equal(values(s.getState()).food, 1) })
  it('A092 N4 no newborn means no activation or food payment', () => { const s = setup(PARENTS, { roomCount: 3, resources: { food: 1 } }); record('no-child', assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, ANY))); assert.equal(values(s.getState()).food, 1) })
  it('A092 N5 last-worker activation feeds an adult and records the native extra-turn seam', () => {
    const s = setup(PARENTS, { roomCount: 3, resources: { food: 20 } }); const offer = lastOrdinary(s)
    assert.equal(newbornCount(s.state.players[0]!), 1); assert.equal(workersAvailable(s.state, s.state.players[0]!), 0)
    const use = options(offer)[0]; assert(use)
    record('nested-anytime', assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, ANY)))
    record('wrong-extra-responder', assertRejectedUnchanged(s, () => s.resolveChoice(1, use.value)))
    let r = record('extra-use', ok(s.resolveChoice(0, use.value)))
    assert.equal(values(r).food, 19); assert.equal(values(r).newborns, 0)
    record('occupied-extra-target', assertRejectedUnchanged(s, () => s.resolveChoice(0, 'forest')))
    r = record('extra-placement', ok(s.resolveChoice(0, 'grain-seeds')))
    assert.equal(values(r).grain, 1); assert.equal(workersAvailable(s.state, s.state.players[0]!), 0)
    record('stale-extra-use', assertRejectedUnchanged(s, () => s.resolveChoice(0, use.value)))
    r = nextRound(s, r); assert.equal(values(r).food, 13); assert.equal(values(r).family, 3)
  })
  it('A092 N6 declining a real birth preserves newborn feeding and records the forfeit seam', () => {
    const s = setup(PARENTS, { roomCount: 3, resources: { food: 20 } }); const offer = lastOrdinary(s)
    const decline = options(offer)[1]; assert(decline)
    const r = record('extra-forfeit', ok(s.resolveChoice(0, decline.value)))
    assert.equal(values(r).food, 20); assert.equal(values(r).newborns, 1)
    const next = nextRound(s, r); assert.equal(values(next).food, 15)
    assert.equal(next.state.players[0]!.cardStates[PARENTS]?.extraData?.forfeitedThisRound, false)
  })
  it('A092 N7 two actual births each pay once and place one of the finite five farmers', () => {
    const s = setup(PARENTS, { roomCount: 3, resources: { wood: 6, reed: 2, grain: 1 } }, st => st.players[0]!.occupationPlayed.push(BED))
    growth(s); turn(s, 1, 'forest'); bed(s, [rooms[3]!])
    assert.equal(familySize(s.state.players[0]!), 4); assert.equal(newbornCount(s.state.players[0]!), 2)
    let r = record('two-child-offer', confirmNext(s, turn(s, 1, 'clay-pit')))
    for (const space of ['grain-seeds', 'day-laborer']) {
      const use = options(r)[0]; assert(use); r = record('two-child-use', ok(s.resolveChoice(0, use.value)))
      r = record(`two-child-place:${space}`, ok(s.resolveChoice(0, space)))
      if (space === 'grain-seeds') r = record('second-child-offer', confirmNext(s, r))
    }
    assert.equal(values(r).food, 30); assert.equal(values(r).newborns, 0); assert.equal(values(r).family, 4)
    r = nextRound(s, r); assert.equal(values(r).food, 22); assert.equal(values(r).grain, 1)
  })
  it('A092 N8 whole real growth and paid promotion undo restores the birth and payment before one retry', () => {
    const s = setup(PARENTS, { roomCount: 3, resources: { food: 1 } }); const before = undoRuleSnapshot(s.getState())
    growth(s); record('undo-test-promote', ok(s.takeAnytimeAction(0, ANY)))
    assertUndoRestored(before, record('undo-parents', s.undoAction()))
    growth(s); const r = record('retry-promote', ok(s.takeAnytimeAction(0, ANY))); assert.equal(values(r).food, 0); assert.equal(values(r).newborns, 0); assert.equal(values(r).family, 3)
  })
})

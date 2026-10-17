import assert from 'node:assert/strict'
import { writeFileSync } from './_helpers/audit-evidence-fs'
import { afterEach, afterAll, it, describe } from 'vitest'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit10Timing from './_helpers/audit/ae-negative-10-timing'

describe('ae-negative-10-timing', () => {
  const { GREEN, sessions, directory, evidence, record, setup, buy, deny, turn, rounds, complete } = audit10Timing
  afterAll(() => writeFileSync(`${directory}/native-responses.json`, JSON.stringify(evidence, null, 2)))
  afterEach(context => sessions.splice(0).forEach(s => { record(`test-final:${context.task.name}`, s.getState()); s.dispose() }))
  it('A069 N1 printed two wood and two occupations gate real purchase', () => { deny(setup(GREEN, { resources: { wood: 1 } }), GREEN); deny(setup(GREEN, { occupations: 1, resources: { wood: 2 } }), GREEN); const r = buy(setup(GREEN, { resources: { wood: 2 } }), GREEN); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.vegetable, 0); assert.deepEqual(rounds(r, GREEN, 'vegetable'), [9, 12, 14]) })
  it('A069 N2 late purchases retain only existing future round spaces', () => { for (const [round, expected] of [[8, [12]], [10, [14]], [11, []], [14, []]] satisfies Array<[number, number[]]>) { const r = buy(setup(GREEN, { round, resources: { wood: 2 } }), GREEN); assert.deepEqual(rounds(r, GREEN, 'vegetable'), expected); assert.equal(r.state.players[0]!.resources.vegetable, 0) } })
  it('A069 N3 natural round starts deliver all three vegetables once only to owner', () => { const s = setup(GREEN, { resources: { wood: 2 } }); buy(s, GREEN); for (let round = 6; round <= 14; round++) { const r = complete(s, round === 6); assert.equal(r.state.round, round); assert.equal(r.state.players[0]!.resources.vegetable, [9, 12, 14].filter(n => n <= round).length); assert.equal(r.state.players[1]!.resources.vegetable, 0); assert.deepEqual(rounds(r, GREEN, 'vegetable'), [9, 12, 14].filter(n => n > round)) } })
  it('A069 N4 unplayed card and opponent actions create no owner schedule', () => { const s = setup(GREEN, { resources: { wood: 2 } }); turn(s, 0, 'reed-bank'); const r = turn(s, 1, 'forest'); assert.deepEqual(rounds(r, GREEN, 'vegetable'), []); assert.equal(r.state.players[0]!.resources.vegetable, 0) })
  it('A069 N5 purchase stale rejection and undo restore fee hand and schedule before retry', () => { const s = setup(GREEN, { resources: { wood: 2 } }); const before = undoRuleSnapshot(s.getState()); let r = buy(s, GREEN); assert.deepEqual(rounds(r, GREEN, 'vegetable'), [9, 12, 14]); record('stale-green', assertRejectedUnchanged(s, () => s.resolveChoice(0, GREEN))); assertUndoRestored(before, record('undo-green', s.undoAction())); r = buy(s, GREEN); assert.equal(r.state.players[0]!.resources.wood, 0); assert.deepEqual(rounds(r, GREEN, 'vegetable'), [9, 12, 14]) })
})

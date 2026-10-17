import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit44Cards from './_helpers/audit/ae-negative-44-cards'

describe('ae-negative-44-cards', () => {
  const { sessions, save, make, finish, lesson, future, reach } = audit44Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D091 N1 actual Lessons schedules offsets four seven ten and truncates beyond round fourteen', () => { for (const [round, targets] of [[2, [6, 9, 12]], [8, [12]], [11, []]] as const) { const s = make('D091_Plowman', undefined, false, round), r = finish(s, lesson(s, 'D091_Plowman'), false); assert.deepEqual(future(r, 'D091_Plowman'), targets.map(round => ({ round, resources: { field: 1 } }))); assert.equal(r.state.players[0]!.fields.length, 0); save(`D091-N1-${round}`, r) } })
  it('D091 N2 naturally reached round six may pay one food for one field or decline and consumes only due tile', () => { for (const accept of [true, false]) { const s = make('D091_Plowman', undefined, false, 2); finish(s, lesson(s, 'D091_Plowman'), false); const early = reach(s, 5); assert.equal(early.state.players[0]!.fields.length, 0); const p = reach(s, 6), r = finish(s, p, accept); assert.equal(r.state.players[0]!.fields.length, accept ? 1 : 0); assert.equal(r.state.players[0]!.resources.food, p.state.players[0]!.resources.food - (accept ? 1 : 0)); assert.deepEqual(future(r, 'D091_Plowman').map(e => e.round), [9, 12]); save(`D091-N2-${accept}`, { early, p, r }) } })
})

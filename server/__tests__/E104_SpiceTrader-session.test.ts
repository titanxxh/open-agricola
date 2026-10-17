import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit47Cards from './_helpers/audit/ae-negative-47-cards'

describe('ae-negative-47-cards', () => {
  const { sessions, save, make, finish, lesson, future, reach } = audit47Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E104 N1 real Lessons through round four schedules exactly three vegetables at round eleven while round five schedules none', () => { for (const round of [4, 5]) { const s = make('E104_SpiceTrader', undefined, false, round), r = finish(s, lesson(s, 'E104_SpiceTrader'), false); assert.deepEqual(future(r, 'E104_SpiceTrader'), round === 4 ? [{ round: 11, resources: { vegetable: 3 } }] : []); assert.equal(r.state.players[0]!.resources.vegetable, 0); save(`E104-N1-${round}`, r) } })
  it('E104 N2 natural round eleven releases only scheduled vegetables and no vegetable is gained at round ten', () => { const s = make('E104_SpiceTrader', undefined, false, 4); finish(s, lesson(s, 'E104_SpiceTrader'), false); const early = finish(s, reach(s, 10), false); assert.equal(early.state.players[0]!.resources.vegetable, 0); const p = reach(s, 11), r = finish(s, p, false); assert.equal(r.state.players[0]!.resources.vegetable, 3); assert.equal(future(r, 'E104_SpiceTrader').length, 0); save('E104-N2', { early, p, r }) })
})

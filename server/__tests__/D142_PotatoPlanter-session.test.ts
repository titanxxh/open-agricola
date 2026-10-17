import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit53Cards from './_helpers/audit/ae-negative-53-cards'

describe('ae-negative-53-cards', () => {
  const { sessions, save, ok, make, finish, ready, resources, reachAvoid } = audit53Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D142 N1 genuine owner Clay Pit or Reed Bank with counterpart empty grants vegetable only at natural work end', () => { for (const [space, other] of [['clay-pit', 'reed-bank'], ['reed-bank', 'clay-pit']]) { const s = make('D142_PotatoPlanter', undefined, true, 5), p = finish(s, ok(s.takeAction(0, space)), false); resources(p, { vegetable: 0 }); const r = reachAvoid(s, 6, [other]); resources(r, { vegetable: 1 }); assert.equal(r.state.round, 6); save(`D142-N1-${space}`, { p, r }) } })
  it('D142 N2 counterpart occupied by actual opponent or neither occupied by owner grants no vegetable at natural work end', () => { for (const ownerSpace of ['clay-pit', 'grain-seeds']) { const s = make('D142_PotatoPlanter', undefined, true, 5); finish(s, ok(s.takeAction(0, ownerSpace)), false); ready(s); finish(s, ok(s.takeAction(1, 'reed-bank')), false); const r = reachAvoid(s, 6, []); resources(r, { vegetable: 0 }); save(`D142-N2-${ownerSpace}`, r) } })
})

import { afterEach, it, describe } from 'vitest'
import * as audit53Cards from './_helpers/audit/ae-negative-53-cards'

describe('ae-negative-53-cards', () => {
  const { sessions, save, ok, make, finish, ready, resources, pool } = audit53Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E137 N1 Reed Bank and Grain Seeds each grant exactly the opposite crop or reed bonus', () => { for (const space of ['reed-bank', 'grain-seeds']) { const s = make('E137_FlaxFarmer', st => pool(st, 'reed-bank', 'reed', 1)), r = finish(s, ok(s.takeAction(0, space)), false); resources(r, { reed: 1, grain: 1 }); save(`E137-N1-${space}`, r) } })
  it('E137 N2 nonmatching owner actual opponent Reed Bank and hand-only Grain Seeds cannot grant bonus', () => { const s = make('E137_FlaxFarmer', st => pool(st, 'reed-bank', 'reed', 1)); finish(s, ok(s.takeAction(0, 'day-laborer')), false); ready(s); const r = finish(s, ok(s.takeAction(1, 'reed-bank')), false); resources(r, { reed: 0, grain: 0, food: 102 }); resources(r, { reed: 1, grain: 0 }, 1); const c = make('E137_FlaxFarmer', undefined, false), cr = finish(c, ok(c.takeAction(0, 'grain-seeds')), false); resources(cr, { grain: 1, reed: 0 }); save('E137-N2', { r, cr }) })
})
